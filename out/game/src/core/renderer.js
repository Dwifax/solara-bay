export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  function resizeCanvas() {
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.scale(dpr, dpr);
  }

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  return {
    getContext() { return ctx; },
    getWidth() { return canvas.width / dpr; },
    getHeight() { return canvas.height / dpr; },
    clear(color) {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    },
    drawRect(x, y, w, h, color) {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
    },
    drawCircle(x, y, r, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    },
    drawLine(x1, y1, x2, y2, color, width) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width || 1;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    },
    drawText(text, x, y, color, size, align) {
      ctx.fillStyle = color;
      ctx.font = `${size || 14}px monospace`;
      ctx.textAlign = align || 'left';
      ctx.fillText(text, x, y);
    }
  };
}
