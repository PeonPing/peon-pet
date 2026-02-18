uniform vec3 flashColor;
uniform float flashIntensity;
varying vec2 vUv;

void main() {
  gl_FragColor = vec4(flashColor, flashIntensity);
}
