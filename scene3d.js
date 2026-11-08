/* 寒鹤博客 · 3D 场景（首页 hero / 音乐 / 照片墙）
 * 只在满足条件时按需加载 three.js 与 GLB，任何一步失败都保留静态图。
 * 调试开关：?3d=1 强制启用、?3d=0 强制关闭（用于对比实测）。
 */
'use strict';

const SCENES = {
  hero: {
    model: 'assets/3d/hero.glb', poster: 'assets/3d/hero.webp',
    pos: [0, 3.85, 13.4], target: [0, 0.95, 0],
    hfov: 38.05, renderAspect: 1600 / 700
  },
  music: {
    model: 'assets/3d/music.glb', poster: 'assets/3d/music.webp',
    pos: [2.55, 3.35, 5.15], target: [0, -0.28, 0],
    hfov: 44.5, renderAspect: 1200 / 760
  },
  wall: {
    model: 'assets/3d/wall.glb', poster: 'assets/3d/wall.webp',
    pos: [0, 0.55, 13.5], target: [0, -0.05, 0],
    hfov: 39.6, renderAspect: 1200 / 760
  }
};

const params = new URLSearchParams(location.search);
const FORCE = params.get('3d') === '1';
const OFF = params.get('3d') === '0';

const lib = { three: null, GLTFLoader: null, promise: null };
const scenes = new Map();   // host 元素 -> 运行时
let rafId = 0;
let lastFrame = 0;

/* ---------------- 能力检测 ---------------- */
function webglOk() {
  try {
    const cv = document.createElement('canvas');
    const gl = cv.getContext('webgl2') || cv.getContext('webgl');
    if (!gl) return false;
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();   // 立刻释放这个临时上下文
    return true;
  } catch (e) { return false; }
}

function use3D() {
  if (OFF) return false;
  if (!FORCE) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (c) {
      if (c.saveData) return false;
      if (/^(slow-2g|2g|3g)$/.test(String(c.effectiveType || ''))) return false;
      if (c.downlink && c.downlink < 1) return false;   // 实测带宽过低（仅挡极慢连接）
    }
    if (innerWidth < 900) return false;                                    // 窄屏只留静态图
    if (navigator.deviceMemory && navigator.deviceMemory < 4) return false;
    if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) return false;
  }
  return webglOk();
}

/* ---------------- 懒加载 three.js ---------------- */
function loadThree() {
  if (lib.promise) return lib.promise;
  lib.promise = Promise.race([
    Promise.all([import('three'), import('three/addons/loaders/GLTFLoader.js')])
      .then(([three, mod]) => { lib.three = three; lib.GLTFLoader = mod.GLTFLoader; return lib; }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('three timeout')), 15000))
  ]).catch(err => { lib.promise = null; throw err; });
  return lib.promise;
}

/* ---------------- 相机：与 poster 的 object-fit:cover 对齐 ----------------
   渲染图有固定宽高比；按容器宽高比取「覆盖」所需的可见视场，避免变形。 */
function fitCamera(s) {
  const w = s.host.clientWidth;
  const h = s.host.clientHeight;
  if (!w || !h) return;
  s.renderer.setSize(w, h, false);
  const A = w / h;
  const tanH = Math.tan(s.cfg.hfov * Math.PI / 360);
  const tanV = tanH / s.cfg.renderAspect;
  const tanVisibleH = Math.min(tanH, tanV * A);
  s.camera.aspect = A;
  s.camera.fov = 2 * Math.atan(tanVisibleH / A) * 180 / Math.PI;
  s.camera.updateProjectionMatrix();
}

function addLights(THREE, scene) {
  const hemi = new THREE.HemisphereLight(0xfff6e6, 0x62786a, 2.0);
  const key = new THREE.DirectionalLight(0xfff2da, 2.6);
  key.position.set(5, 8, 6);
  const fill = new THREE.DirectionalLight(0xd6e4d9, 1.1);
  fill.position.set(-6, 3, 4);
  scene.add(hemi, key, fill);
}

/* ---------------- 逐场景动画 ---------------- */
function buildUpdate(s) {
  const n = s.nodes;
  const THREE = s.THREE;

  if (s.name === 'hero') {
    const body = n.CraneBody;
    const island = n.Island;
    const clouds = ['CloudA', 'CloudB'].map(k => n[k]).filter(Boolean)
      .map((o, i) => ({ o, x: o.position.x, y: o.position.y, ph: i * 1.6 }));
    const islandBase = island ? island.position.clone() : null;
    if (body) {
      const baseQuat = body.quaternion.clone();
      const baseY = body.position.y;
      const yAxis = new THREE.Vector3(0, 1, 0);
      const q = new THREE.Quaternion();
      s.update = (t) => {
        q.setFromAxisAngle(yAxis, Math.sin(t * 0.17) * 0.22);
        body.quaternion.copy(baseQuat).multiply(q);
        body.position.y = baseY + Math.sin(t * 0.5) * 0.10;
        for (const c of clouds) {
          c.o.position.x = c.x + Math.sin(t * 0.12 + c.ph) * 0.16;
          c.o.position.y = c.y + Math.sin(t * 0.26 + c.ph) * 0.07;
        }
        if (island) island.position.y = islandBase.y + Math.sin(t * 0.16) * 0.06;
      };
    }
  }

  if (s.name === 'music') {
    const disc = n.Disc;
    // glTF 里圆柱的轴向是 +Y（Blender 的 Z 在导出时被转成 Y），所以绕 Y 才是原地匀速旋转
    if (disc) s.update = (t, dt) => { disc.rotateY(dt * 0.5); };
  }

  if (s.name === 'wall') {
    const frames = [];
    for (let i = 1; i <= 9; i++) {
      const f = n['Frame_' + String(i).padStart(2, '0')];
      if (f) frames.push({ o: f, y: f.position.y, ph: i * 0.7 });
    }
    s.tx = 0; s.ty = 0; s.px = 0; s.py = 0;
    s.update = (t) => {
      for (const f of frames) f.o.position.y = f.y + Math.sin(t * 0.4 + f.ph) * 0.035;
      s.px += (s.tx - s.px) * 0.06;
      s.py += (s.ty - s.py) * 0.06;
      s.camera.position.set(s.base.x + s.px * 0.34, s.base.y + s.py * 0.20, s.base.z);
      s.camera.lookAt(s.target);
    };
    s.host.addEventListener('pointermove', e => {
      const r = s.host.getBoundingClientRect();
      s.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
      s.ty = ((e.clientY - r.top) / r.height) * 2 - 1;
    });
    s.host.addEventListener('pointerleave', () => { s.tx = 0; s.ty = 0; });
  }

  if (!s.update) s.update = () => {};
  // 收集照片槽位（Slot_01..09）并对外部照片数据做出响应
  if (s.name === 'wall') {
    for (let i = 1; i <= 9; i++) {
      const slot = n['Slot_' + String(i).padStart(2, '0')];
      if (slot) s.slots.push(slot);
    }
    const apply = () => applyPhotos(s);
    apply();
    addEventListener('hanhe:photos', apply);
  }
}

/* ---------------- 照片贴进相框 ---------------- */
function applyPhotos(s) {
  const photos = (window.HanheBlog && window.HanheBlog.photos) || [];
  if (!photos.length || !s.slots.length) return;
  const THREE = s.THREE;
  const loader = new THREE.TextureLoader();
  s.slots.forEach((mesh, i) => {
    if (s.photoDone.has(i)) return;
    const p = photos[i];
    if (!p || !p.src) return;
    loader.load(p.src, tex => {
      s.photoDone.add(i);
      tex.colorSpace = THREE.SRGBColorSpace;
      mesh.geometry.computeBoundingBox();
      const bb = mesh.geometry.boundingBox;
      const slotAspect = (bb.max.x - bb.min.x) / (bb.max.y - bb.min.y);
      const imgAspect = tex.image.width / tex.image.height;
      // 按 cover 规则裁切，避免照片被拉扁
      if (imgAspect > slotAspect) {
        const rx = slotAspect / imgAspect;
        tex.repeat.set(rx, 1);
        tex.offset.set((1 - rx) / 2, 0);
      } else {
        const ry = imgAspect / slotAspect;
        tex.repeat.set(1, ry);
        tex.offset.set(0, (1 - ry) / 2);
      }
      mesh.material = new THREE.MeshBasicMaterial({ map: tex });
      if (s.visible) draw(s);
    }, undefined, () => {});
  });
}

/* ---------------- 渲染循环（仅渲染可见场景） ---------------- */
function draw(s) { s.renderer.render(s.scene, s.camera); }

function tick(now) {
  rafId = 0;
  if (!lastFrame) lastFrame = now;
  const dt = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  let any = false;
  for (const s of scenes.values()) {
    if (!s.running || !s.visible) continue;
    s.update(now / 1000, dt);
    draw(s);
    any = true;
  }
  if (any) rafId = requestAnimationFrame(tick);
  else lastFrame = 0;
}

function start(s) {
  s.running = true;
  if (!rafId) rafId = requestAnimationFrame(tick);
}
function stop(s) { s.running = false; }

/* ---------------- 挂载 ---------------- */
async function mount(host, name) {
  if (host.dataset.mounted || host.dataset.mounting) return;
  host.dataset.mounting = '1';
  const cfg = SCENES[name];
  try {
    const { three, GLTFLoader } = await loadThree();
    const gltf = await new Promise((res, rej) => new GLTFLoader().load(cfg.model, res, undefined, rej));

    const canvas = host.querySelector('canvas');
    const renderer = new three.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setClearAlpha(0);
    renderer.outputColorSpace = three.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));

    const scene3d = new three.Scene();
    scene3d.add(gltf.scene);
    addLights(three, scene3d);

    const camera = new three.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
    const target = new three.Vector3(cfg.target[0], cfg.target[1], cfg.target[2]);
    camera.lookAt(target);

    const s = {
      host, name, cfg, THREE: three, renderer, scene: scene3d, camera, target,
      base: new three.Vector3(cfg.pos[0], cfg.pos[1], cfg.pos[2]),
      nodes: {}, slots: [], photoDone: new Set(),
      visible: true, running: false, update: null
    };
    gltf.scene.traverse(o => { if (o.name) s.nodes[o.name] = o; });
    buildUpdate(s);
    fitCamera(s);

    const ro = new ResizeObserver(() => { fitCamera(s); if (s.visible) draw(s); });
    ro.observe(host);

    canvas.hidden = false;
    host.classList.add('ready');
    host.dataset.mounted = '1';
    delete host.dataset.mounting;
    scenes.set(host, s);

    // 离开视口就暂停，回来再继续
    const vo = new IntersectionObserver(entries => {
      s.visible = entries[0].isIntersecting;
      if (s.visible) start(s); else stop(s);
    }, { threshold: 0.02 });
    vo.observe(host);

    start(s);
    draw(s);

    canvas.addEventListener('webglcontextlost', ev => {
      ev.preventDefault();
      stop(s);
      host.classList.remove('ready');
      canvas.hidden = true;
      console.warn('[scene3d] WebGL context lost, fallback to poster');
    });
  } catch (err) {
    delete host.dataset.mounting;
    document.documentElement.dataset.scene3d = 'fallback';
    console.warn('[scene3d] 3D 不可用，保留静态图：', name, err);
  }
}

/* ---------------- 首页 hero：首屏绘制完成后再升级 ---------------- */
function heroUpgrade() {
  const box = document.getElementById('hero3d');
  if (!box || box.dataset.mounted || box.dataset.mounting) return;
  const hero = document.querySelector('.hero');
  const poster = document.getElementById('heroPoster');
  hero.classList.add('poster-on');
  box.hidden = false;
  if (poster) {
    poster.addEventListener('load', () => poster.classList.add('on'), { once: true });
    poster.src = SCENES.hero.poster;
  }
  mount(box, 'hero');
}

/* ---------------- 启动 ---------------- */
function main() {
  if (!use3D()) {
    document.documentElement.dataset.scene3d = 'off';
    return;
  }
  document.documentElement.dataset.scene3d = 'on';

  const io = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const host = entry.target;
      if (entry.isIntersecting) {
        const s = scenes.get(host);
        if (!s) mount(host, host.dataset.scene);
        else { s.visible = true; start(s); }
      } else {
        const s = scenes.get(host);
        if (s) s.visible = false;
      }
    }
  }, { rootMargin: '160px 0px', threshold: 0.01 });
  document.querySelectorAll('.scene-3d[data-scene]').forEach(el => io.observe(el));

  const idle = () => {
    if (document.hidden) return;
    const after = () => heroUpgrade();
    if ('requestIdleCallback' in window) requestIdleCallback(after, { timeout: 2500 });
    else setTimeout(after, 700);
  };
  if (document.readyState === 'complete') idle();
  else addEventListener('load', idle, { once: true });
}

main();
