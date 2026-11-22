// Weapon silhouettes drawn with canvas paths for the HUD and the weapon wheel.

const SHAPES = {
  fists(ctx) {
    ctx.beginPath();
    ctx.roundRect(28, 8, 34, 24, 8);
    ctx.fill();
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.roundRect(30 + i * 8, 4, 7, 12, 3);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.roundRect(22, 16, 12, 10, 4);
    ctx.fill();
  },
  pistol(ctx) {
    ctx.fillRect(22, 10, 46, 9);
    ctx.fillRect(64, 8, 4, 3);
    ctx.beginPath();
    ctx.moveTo(26, 19);
    ctx.lineTo(38, 19);
    ctx.lineTo(34, 36);
    ctx.lineTo(22, 36);
    ctx.closePath();
    ctx.fill();
    ctx.strokeRect(38, 19, 7, 7);
  },
  smg(ctx) {
    ctx.fillRect(14, 11, 56, 10);
    ctx.fillRect(70, 14, 10, 4);
    ctx.fillRect(40, 21, 7, 16);
    ctx.fillRect(22, 21, 8, 10);
    ctx.fillRect(4, 13, 12, 5);
    ctx.fillRect(2, 13, 4, 12);
  },
  shotgun(ctx) {
    ctx.fillRect(16, 12, 68, 6);
    ctx.fillRect(30, 18, 30, 5);
    ctx.beginPath();
    ctx.moveTo(18, 12);
    ctx.lineTo(4, 22);
    ctx.lineTo(4, 30);
    ctx.lineTo(20, 20);
    ctx.closePath();
    ctx.fill();
  },
  rifle(ctx) {
    ctx.fillRect(18, 11, 62, 8);
    ctx.fillRect(80, 13, 8, 3);
    ctx.fillRect(40, 19, 8, 16);
    ctx.fillRect(28, 19, 7, 10);
    ctx.fillRect(30, 6, 18, 5);
    ctx.beginPath();
    ctx.moveTo(18, 11);
    ctx.lineTo(4, 14);
    ctx.lineTo(4, 26);
    ctx.lineTo(18, 19);
    ctx.closePath();
    ctx.fill();
  },
};

/** Draw weapon `id` into a 90×40 canvas. */
export function drawWeaponIcon(canvas, id, color = '#ffffff') {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(canvas.width / 90, canvas.height / 40);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 3;
  (SHAPES[id] ?? SHAPES.fists)(ctx);
  ctx.restore();
}
