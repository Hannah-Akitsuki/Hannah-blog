# 素材来源与许可（CREDITS）

本站 3D 场景的几何体、材质与静态渲染图**全部由本站脚本程序化生成**，没有使用任何外部模型、贴图或图片素材，因此不存在署名要求。

## 3D 资产（自建）

| 文件 | 用途 | 生成方式 | 许可 |
|---|---|---|---|
| `assets/3d/hero.glb` | 首页 hero：纸鹤 + 云带 + 浮空岛 | `tools/blender/build_assets.py`（Blender bpy 程序化建模） | 本站原创，随本站代码 |
| `assets/3d/music.glb` | 音乐页：低模黑胶 + 唱臂 | 同上 | 本站原创，随本站代码 |
| `assets/3d/wall.glb` | 照片墙：3D 相框墙（含 9 个照片槽位） | 同上 | 本站原创，随本站代码 |
| `assets/3d/*-draco.glb` | 仅用于压缩体积对比，未上线 | 同上（Draco 导出） | 本站原创，随本站代码 |
| `assets/3d/hero.webp` | hero 静态渲染图（1600×700，透明底） | Blender Cycles 渲染 → `tools/blender/to_webp.py` | 本站原创，随本站代码 |
| `assets/3d/music.webp` | 音乐页静态渲染图（1200×760，透明底） | 同上 | 本站原创，随本站代码 |
| `assets/3d/wall.webp` | 照片墙静态渲染图（1200×760，透明底） | 同上 | 本站原创，随本站代码 |

- 材质只使用纯色 Principled BSDF 参数，**没有外挂贴图文件**；静态图的底色由页面 CSS 渐变提供。
- 场景配色取自站点既有的米白 / 墨绿 / 暖沙色系。

## 站点原有图片（自建）

| 文件 | 用途 | 来源 | 许可 |
|---|---|---|---|
| `assets/hero.jpg` | 首页 hero 原始照片（绿植人脸） | 站主自有 | 本站原创，随本站代码 |
| `assets/hero.webp` | 上一行的 WebP 转码（1200×1600，q70），供 hero 静态兜底 | 由 `assets/hero.jpg` 转码 | 同上 |

## 运行时第三方库

| 名称 | 版本 | 用途 | 许可 |
|---|---|---|---|
| [three.js](https://github.com/mrdoob/three.js) | r180（0.180.0） | 网页端 glTF 渲染、相机与动画 | MIT |
| [marked](https://github.com/markedjs/marked) | CDN 最新版 | 站内 Markdown 渲染（既有功能） | MIT |

three.js 及其 `GLTFLoader`、`BufferGeometryUtils` 已**本地化**到 `vendor/three/`（MIT 许可允许再分发，保留原文件头部的版权声明），不再依赖第三方 CDN；只在桌面端满足加载条件时按需 `import()`，不在首屏阻塞渲染。

## 字体（既有）

| 名称 | 来源 | 许可 |
|---|---|---|
| DM Sans / Noto Serif SC | Google Fonts | SIL Open Font License 1.1 |

## 修改说明

- 所有 GLB 与 WebP 均由上述脚本生成，可随时用 `tools/blender/build-assets.bat` 重建。
- 若将来替换为外部素材，只允许 CC0 / Public Domain，并在本文件补一行：素材名、来源链接、许可证、是否修改。
