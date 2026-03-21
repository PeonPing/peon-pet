'use strict';

const WIN_SIZE = 200;
const WIN_MARGIN = 20;

function cornerPosition(corner, width, height) {
  const right = width - WIN_SIZE - WIN_MARGIN;
  const bottom = height - WIN_SIZE - WIN_MARGIN;
  switch (corner) {
    case 'top-left':     return { x: WIN_MARGIN, y: WIN_MARGIN };
    case 'top-right':    return { x: right,      y: WIN_MARGIN };
    case 'bottom-right': return { x: right,      y: bottom };
    default:             return { x: WIN_MARGIN, y: bottom }; // bottom-left
  }
}

module.exports = { WIN_SIZE, WIN_MARGIN, cornerPosition };
