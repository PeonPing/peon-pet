// Stub — just proves the window loads
const canvas = document.getElementById('c');
canvas.width = 200;
canvas.height = 200;
const ctx = canvas.getContext('2d');
ctx.fillStyle = 'rgba(255,0,0,0.3)';
ctx.fillRect(0, 0, 200, 200);
ctx.fillStyle = 'white';
ctx.font = '14px sans-serif';
ctx.fillText('peon loading...', 10, 100);
