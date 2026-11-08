/* 交互演示清单：id、课程、标题、一句话说明。
   列表页与按需加载都从这里取元数据，不在 app.js 里重复。 */
export const DEMOS = [
  { id: 'sort',   course: '数据结构', title: '排序算法全家桶', desc: '插入 / 希尔 / 冒泡 / 快排 / 选择 / 堆排 / 归并 / 基数，八种切换，比较与移动次数实时计数。' },
  { id: 'tree',   course: '数据结构', title: '二叉树遍历', desc: '前序、中序、后序与层序，单步高亮当前节点，同步显示调用栈或队列。' },
  { id: 'avl',    course: '数据结构', title: 'AVL 四种旋转', desc: 'LL / RR / LR / RL 失衡修正，指针改接与高度更新逐步可见。' },
  { id: 'loser',  course: '数据结构', title: '败者树 k 路归并', desc: '败者留在父节点、胜者逐层上浮，看每次输出与重建。' },
  { id: 'rb',     course: '数据结构', title: '红黑树插入', desc: '变色与旋转修复红黑性质，可慢速逐步查看。' },
  { id: 'vmem',   course: '计算机组成原理', title: '虚拟地址 → 物理地址', desc: '地址拆分、TLB 查找、页表遍历、物理地址拼装整条链路。' },
  { id: 'cache',  course: '计算机组成原理', title: 'Cache 三种映射', desc: '直接映射、全相联、组相联的地址分段与命中判断。' },
  { id: 'page',   course: '操作系统', title: '页面置换四算法', desc: 'LRU / FIFO / OPT / Clock 同一引用串并排对比缺页次数与缺页率。' },
  { id: 'disk',   course: '操作系统', title: '磁盘调度六算法', desc: 'FCFS / SSTF / SCAN / LOOK / C-SCAN / C-LOOK 磁头轨迹与总移动磁道数对比。' },
  { id: 'tcp',    course: '计算机网络', title: 'TCP 握手与挥手', desc: '三次握手、四次挥手的报文与两端状态机，逐步推进。' }
];

export const COURSE_ORDER = ['数据结构', '计算机组成原理', '操作系统', '计算机网络'];

export function demoById(id) {
  return DEMOS.find(d => d.id === id) || null;
}
