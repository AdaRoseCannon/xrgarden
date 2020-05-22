
import { Voronoi, relaxCells, distance } from './voronoi.js';
import {
  WebGLRenderTarget,
  RGBFormat,
  DepthTexture,
  UnsignedShortType,
  RepeatWrapping,
  MeshBasicMaterial,
  CanvasTexture,
  PlaneGeometry,
  Mesh,
  ShaderMaterial,
  Color,
  Vector2
} from 'three';

import {
  scene,
  camera,
  rafCallbacks
} from './scene.js';


const depthMaterial = new MeshBasicMaterial({
  colorWrite: false
});

const target = new WebGLRenderTarget(100, 100);
target.texture.format = RGBFormat;
target.texture.generateMipmaps = false;
target.stencilBuffer = false;
target.depthBuffer = true;
target.depthTexture = new DepthTexture();
target.depthTexture.type = UnsignedShortType;

function lerp(p1, p2, t = 0.5) {
  return {
    x: p1.x + (p2.x - p1.x) * t,
    y: p1.y + (p2.y - p1.y) * t,
  }
}

function generateCausticCanvasTexture(nPoints) {
  const voronoi = new Voronoi();
  const originalSites = [];
  const width = 512;
  const height = 512;
  const targetGap = width / 55;
  const bbox = { xl: -width, xr: width * 2, yt: -height, yb: height * 2 }; // xl is x-left, xr is x-right, yt is y-top, and yb is y-bottom
  for (let i = 0; i < nPoints - 3; i++) originalSites.push({
    x: Math.random() * width,
    y: Math.random() * height,
  });
  originalSites.push(...relaxCells(voronoi.compute(originalSites.splice(0), bbox).cells));
  for (let i = 0; i < 3; i++) originalSites.push({
    x: Math.random() * width,
    y: Math.random() * height,
  });
  const sites = [];
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      for (const site of originalSites) {
        sites.push({
          x: site.x + width * i,
          y: site.y + height * j,
        });
      }
    }
  }
  const shapes = voronoi.compute(sites, bbox);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", 'svg');
  svg.setAttribute('xmlns', "http://www.w3.org/2000/svg");
  svg.setAttribute('viewBox', `${0} ${0} ${width} ${height}`);
  svg.setAttribute('style', `width:${width}px; height:${height}px; position: absolute;`);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.innerHTML = `
    <rect x="0" y="0" width="100%" height="100%" fill="white" />
    <defs>
        <filter id="goo">
            <feGaussianBlur in="SourceGraphic" result="blur" stdDeviation="10"></feGaussianBlur>
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo"></feColorMatrix>
            <feComposite in="SourceGraphic" in2="goo" operator="atop"></feComposite>
        </filter>
        <filter id="goo2">
            <feGaussianBlur in="SourceGraphic" result="blur" stdDeviation="4"></feGaussianBlur>
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 14 -8" result="goo"></feColorMatrix>
            <feComposite in="SourceGraphic" in2="goo" operator="atop"></feComposite>
        </filter>
        <filter id="displacementFilter">
        <feTurbulence type="turbulence" baseFrequency="0.025" stitchTiles="stitch"
            numOctaves="1" result="turbulence"/>
        <feGaussianBlur in="turbulence" result="blur" stdDeviation="10"></feGaussianBlur>
        <feDisplacementMap in2="blur" in="SourceGraphic"
            scale="${width / 13}" xChannelSelector="R" yChannelSelector="G"/>
        </filter>
    </defs>
    <g style="filter: url(#goo2);"></g>
    `;
  const g = svg.querySelector('g');
  for (const cell of shapes.cells) {
    if (!cell.halfedges[0]) continue;
    const p = document.createElementNS("http://www.w3.org/2000/svg", 'polygon');
    const vertices = [];
    vertices.push(cell.halfedges[0].getStartpoint());
    for (const halfEdge of cell.halfedges) {
      vertices.push(halfEdge.getEndpoint());
    }
    p.setAttribute('points', vertices.map(vertex => {
      const t = 1 - targetGap / Math.max(distance(cell.site, vertex), targetGap);
      return lerp(cell.site, vertex, t)
    }).map(vertex => `${vertex.x},${vertex.y}`).join(' '));
    p.setAttribute('style', "fill:black;stroke-width:0;filter:url(#goo);");
    g.appendChild(p);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const canvasTexture = new CanvasTexture(canvas);
  canvasTexture.wrapS = canvasTexture.wrapT = RepeatWrapping;
  canvasTexture.anisotropy = 2;
  const img = document.createElement('img');
  const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  img.onload = function () {
    canvas.getContext('2d').drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    canvasTexture.needsUpdate = true;
  }
  img.src = url;

  return canvasTexture;
}

const time = { value: 0.1 };
const uniforms = {
  depth_map: {value: target.depthTexture},
  map: {value: generateCausticCanvasTexture(15)},
  camera_near: {value: camera.near},
  camera_far: {value: camera.far},
  uTime: time,
  color_foam: {value: new Color('lavenderblush')},
  color_shallow: {value: new Color('lavenderblush')},
  color_deep: {value: new Color('darkblue')},
  opacity_shallow: { value: 0.8 },
  opacity_deep: { value: 1.0 },
  opacity_foam: { value: 0.8 },
  repeat: { value: 500 },
  max_depth: { value: 3 }
};

rafCallbacks.add(t => time.value = t);

const waterMat = new ShaderMaterial({
  vertexShader: `
  varying vec2 vUv;
  varying vec4 viewZ;
  varying vec4 screenSpace;
  uniform float uTime;
  uniform float repeat;

  void main() {
    #include <beginnormal_vertex>
    #include <defaultnormal_vertex>
    #include <begin_vertex>

    float time = uTime * 0.001;
    vUv = uv;
    transformed.z += 0.04*sin(time/4.1) + 0.04*(sin(time/1.8 + repeat*uv.y) + cos(time/2.0 + repeat*uv.x));
    transformedNormal = cross(transformedNormal, normalize(vec3(
      cos(time/1.8 + repeat*uv.y),
      -sin(time/2.0 + repeat*uv.x),
      1.0
    )));

    viewZ = -(modelViewMatrix * vec4(transformed, 1.));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
    screenSpace = gl_Position;
  }
  `.trim(),

  fragmentShader: `
  #include <packing>
  varying vec2 vUv;
  varying vec4 viewZ;
  varying vec4 screenSpace;
  uniform sampler2D depth_map;
  uniform sampler2D map;
  uniform float camera_near;
  uniform float camera_far;
  uniform float uTime;
  uniform float repeat;
  uniform vec3 color_foam;
  uniform vec3 color_shallow;
  uniform vec3 color_deep;
  uniform float opacity_shallow;
  uniform float opacity_deep;
  uniform float opacity_foam;
  uniform float max_depth;

  float readDepth( sampler2D depthSampler, vec2 coord ) {
    float fragCoordZ = texture2D( depthSampler, coord ).x;
    float viewZ = perspectiveDepthToViewZ( fragCoordZ, camera_near, camera_far );
    return viewZToOrthographicDepth( viewZ, camera_near, camera_far );
  }

  void main() {
    float time = uTime * 0.001;
    float distanceDark = 8.0;
    float distanceLight = 12.0;
    float max_depth = 3.0;

    // Depth of point on ocean surface
    float depth2 = viewZ.z;

    // XY position in screenspace
    vec2 samplePoint = 0.5+0.5*screenSpace.xy/screenSpace.w;
    vec2 samplePointOffset = samplePoint + (0.005/(depth2*depth2))*vec2(sin(time + 30.0*repeat*vUv.x),cos(time + 30.0*repeat*vUv.y));

    // Normalised depth of scene betweet 0 and 1
    float depth = readDepth( depth_map, samplePoint );

    // Depth of scene in range of camera
    float depth1 = mix( camera_near, camera_far, depth);

    vec4 col1 = vec4( color_shallow, opacity_shallow );
    vec4 col2 = vec4( color_deep, opacity_deep );

    vec4 darkFoam = 1.0 - 0.2*smoothstep(distanceDark, 0.0,depth2)*texture2D(map, vUv * repeat*1.25);
    vec4 lightFoam = vec4(color_foam,1.0) * texture2D(map, vUv * repeat +
      (1.0/repeat) * vec2(sin(time*2.0+repeat*10.0*vUv.x), cos(time*2.0+repeat*10.0*vUv.y)) +
      (2.0/repeat) * vec2(sin(repeat*20.0*vUv.x), cos(repeat*20.0*vUv.y))
    ) * 0.5 * smoothstep(distanceLight, 0.0,depth2);
    lightFoam.a = lightFoam.r;

    if (depth1 - depth2 < 0.2) {
      gl_FragColor = vec4(color_foam,opacity_foam * smoothstep(0.0,0.1,depth1 - depth2));
    } else {
      vec4 depthCol;
      float transition = smoothstep(0.2 , 0.3, depth1 - depth2);
      float refracdepth_map = mix( camera_near, camera_far, readDepth(depth_map, samplePointOffset));

      depthCol = 1.5 * mix(0.5 * col1, col2, smoothstep(0.0, max_depth, refracdepth_map - depth2));

      // Don't ripple if the sampled texel is in front of the plane
      if (depth2 > refracdepth_map) {
        depthCol = 1.5 * mix(0.5 * col1, col2, smoothstep(0.0, max_depth, depth1 - depth2));
      }
      
      gl_FragColor = mix(vec4(color_foam,opacity_foam), depthCol * darkFoam, transition);
    }

    if (depth1 - depth2 > 0.1) {
      gl_FragColor += lightFoam;
    }
  }`.trim(),
  uniforms,
  depthWrite: false
});
waterMat.transparent = true;

const water = new Mesh(
  new PlaneGeometry(500, 500, 50, 50),
  waterMat
);
water.rotation.x = -Math.PI / 2;
water.position.y = 0.5;
water.name = 'water';
scene.add(water);

const debug = new Mesh(
  new PlaneGeometry(),
  new MeshBasicMaterial({
    map: target.texture
  })
);
debug.position.set(0.5,0.5,-3);
camera.add(debug);

const temp = new Vector2();
water.onBeforeRender = function(renderer, scene, camera) {

  renderer.setRenderTarget( target );
  
  // In case the scene has changed size update the uniform and the render target size.
  renderer.getDrawingBufferSize(temp);
  target.setSize( 512, 512 ); // temp.x, temp.y

  this.visible = false;

  // This material doesn't write color
  // scene.overrideMaterial = depthMaterial;

  renderer.render( scene, camera );

  scene.overrideMaterial = null;
  renderer.setRenderTarget( null );

  this.visible = true;
}

export {
  water
}