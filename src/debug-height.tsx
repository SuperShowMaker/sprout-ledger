// 临时：输出各层实际高度
setTimeout(() => {
  const els = [
    '.app-container', '.app-main',
    '.ant-tabs', '.ant-tabs-content-holder', '.ant-tabs-content',
    '.ant-tabs-tabpane',
  ];
  els.forEach(sel => {
    const el = document.querySelector(sel);
    if (el) {
      const style = getComputedStyle(el);
      console.log(sel, 'height:', style.height, 'overflow-y:', style.overflowY, 'flex:', style.flex, 'display:', style.display);
    }
  });
}, 1000);
