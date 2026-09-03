export function buildServerStrictFrameLockPrompt({ userPrompt = '', segmentPosition = 0, projectMode = '' } = {}) {
  const prompt = String(userPrompt || '').trim();
  const position = Math.max(0, Number.isFinite(Number(segmentPosition)) ? Number(segmentPosition) : 0);
  const mode = String(projectMode || '').toLowerCase();
  const modeLine = mode === 'multi_frame'
    ? '多帧 Storyboard 只是把多组首尾帧拆成多个独立任务逐段提交；当前任务仍然是一个严格的首帧→尾帧任务。'
    : '当前任务是一个严格的首帧→尾帧任务。';
  return [
    '【Davis Video 严格首尾帧硬约束｜最高优先级｜形象锁定】',
    `当前为第 ${position + 1} 段。${modeLine}`,
    '首帧和尾帧不是风格参考，而是必须准确复现的硬控制点。尾帧外观一致性是最终验收标准。',
    'A. 第1帧必须最大程度复现首帧原图；主体身份、IP造型、Logo、文字、数字、轮廓、颜色、材质、道具、背景、透视、构图和相对位置不得擅自改变。',
    'B. 最后1帧必须最大程度复现尾帧原图，而且要求“样子一致”而不仅是内容接近。禁止把尾帧主体、IP、数字、Logo、图标、文字、道具重绘成另一版设计。',
    'C. 首尾帧中没有发生变化的元素视为冻结元素，从头到尾保持同一身份、造型、比例、颜色、材质和设计语言。',
    'D. 首尾帧中发生变化的元素只能从A定向插值到B，不允许中途变成第三种陌生造型再回到B。',
    'E. 中间过程只允许连续插值、位移、缓动、视差、镜头运动和必要形变；禁止新增首尾帧都不存在的主要元素，禁止删除首尾帧都存在的主要元素。',
    'F. 若文字与首尾帧冲突，以首尾帧为最高优先级。宁可减少运动和创意，也不能牺牲尾帧外观一致性。',
    'G. 动画最后阶段必须主动收敛到尾帧；结尾不得继续产生新的构图、元素、动作或设计变化。',
    '【本段用户运动/过渡要求】',
    prompt || '只做稳定、自然、低自由度的首尾帧过渡。',
  ].join('\n');
}
