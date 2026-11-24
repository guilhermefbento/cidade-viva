import * as THREE from '/three/three.module.js';

export function launchBridge(host, story) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x071d2e, .0013);
  const camera = new THREE.PerspectiveCamera(49, 1, .8, 2100);
  const material = (color, glow = 0) => new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: glow, roughness: .82,
  });
  scene.add(new THREE.HemisphereLight(0xa9d9ff, 0x283346, 2.6));
  const warm = new THREE.DirectionalLight(0xffbe73, 3.5);
  warm.position.set(100, 90, 50);
  scene.add(warm);
  const concrete = material(0xac8869, .15);
  const steel = material(0xffc875, .75);
  const asphalt = material(0x222937, .1);
  const roadMark = material(0xead9ae, .65);
  const banks = material(0x0c2428);
  const boxes = new THREE.BoxGeometry(1, 1, 1);
  function box(x, y, z, w, h, d, mat) {
    const object = new THREE.Mesh(boxes, mat);
    object.scale.set(w,h,d);
    object.position.set(x,y,z);
    scene.add(object);
    return object;
  }
  const vector = (...values) => new THREE.Vector3(...values);
  const rodGeometry = new THREE.CylinderGeometry(1, 1, 1, 6);
  function rod(a, b, width, mat, depth = width) {
    const center = a.clone().lerp(b,.5);
    const object = new THREE.Mesh(rodGeometry, mat);
    object.position.copy(center);
    object.scale.set(width, a.distanceTo(b), depth);
    object.quaternion.setFromUnitVectors(vector(0,1,0), b.clone().sub(a).normalize());
    scene.add(object);
  }

  box(0,-4,0,1900,7,1900,material(0x071c2e,.34));
  box(-287,-.6,0,350,3,1800,banks);
  box(292,-.6,0,355,3,1800,banks);
  const city = [
    material(0x344a5c,.1), material(0x465262,.1), material(0x294455,.14), material(0x565660,.09),
  ];
  const windows = [
    new THREE.MeshBasicMaterial({ color: 0xffbb66 }), new THREE.MeshBasicMaterial({ color: 0x9fdbf2 }),
  ];
  let seed = 61;
  const random = () => { seed = (Math.imul(seed,1664525)+1013904223) >>> 0; return seed / 4294967296; };
  const windowPositions = [[],[]];
  for (const bank of [-1,1]) {
    for (let row=0;row<7;row++) for (let col=0;col<24;col++) {
      if (random()<.19) continue;
      const x=bank*(155+row*46+random()*16);
      const z=(col-11)*51+random()*20;
      const width=15+random()*20, depth=17+random()*21;
      const height=12+Math.pow(random(),1.5)*(70+row*9);
      box(x,height/2,z,width,height,depth,city[Math.floor(random()*city.length)]);
      for (let level=5;level<height-2;level+=4.6) {
        for (let offset=-width/2+3;offset<width/2-1;offset+=4.6) {
          if (random()<.33) windowPositions[random()<.7?0:1].push([x+offset,level,z+depth/2+.05,1.5,1.15,.1]);
        }
        for (let offset=-depth/2+3;offset<depth/2-1;offset+=4.6) {
          if (random()<.34) windowPositions[random()<.7?0:1].push([x-bank*(width/2+.05),level,z+offset,.1,1.15,1.5]);
        }
      }
    }
  }
  const dummy = new THREE.Object3D();
  for (const [i, positions] of windowPositions.entries()) {
    const batch = new THREE.InstancedMesh(boxes, windows[i], positions.length);
    positions.forEach(([x,y,z,w,h,d],index) => {
      dummy.position.set(x,y,z);
      dummy.scale.set(w,h,d);
      dummy.updateMatrix();
      batch.setMatrixAt(index,dummy.matrix);
    });
    scene.add(batch);
  }

  const point = (t, branch) => vector(t*236, 16 + branch*3.5 + 4*(1-t*t), branch*(t*85 + 27*Math.sin(t*1.57)) + 8);
  for (const branch of [-1,1]) {
    for (let i=0;i<96;i++) {
      const t=-1+i/48;
      const a=point(t,branch), b=point(t+1/48,branch);
      const mid=a.clone().lerp(b,.5);
      const length=a.distanceTo(b);
      const angle=Math.atan2(-(b.z-a.z),b.x-a.x);
      const segment=box(mid.x,mid.y,mid.z,length+.27,2.6,15,asphalt);
      segment.rotation.y=angle;
      for (const edge of [-1,1]) {
        const x=mid.x+Math.sin(angle)*edge*7.3, z=mid.z+Math.cos(angle)*edge*7.3;
        box(x,mid.y+1.58,z,length+.25,.46,.38,steel).rotation.y=angle;
      }
      if (i%3===0) box(mid.x,mid.y+1.32,mid.z,length*.68,.035,.16,roadMark).rotation.y=angle;
      if (i%9===0 && Math.abs(t)>.19) box(mid.x,mid.y/2,mid.z,2.65,mid.y,2.65,concrete);
    }
  }
  for (const arm of [-1,1]) {
    const base=vector(arm*25,0,arm*8), waist=vector(-arm*6,76,arm*8), top=vector(-arm*20,142,arm*9);
    rod(base,waist,5.4,concrete,4.3);
    rod(waist,top,4.45,concrete,3.35);
    for (const branch of [-1,1]) for (let i=0;i<16;i++) {
      const t=arm*(.15+i*.038);
      const origin=waist.clone().lerp(top,.13+i*.053);
      const end=point(t,branch);
      end.z+=branch*6.4;
      end.y+=1.4;
      rod(origin,end,.105,steel);
    }
  }

  const amber = new THREE.MeshBasicMaterial({color:0xffbb75});
  const white = new THREE.MeshBasicMaterial({color:0xdff3ff});
  const red = new THREE.MeshBasicMaterial({color:0xff5651});
  const carPaint = [material(0x314655),material(0x122332),material(0x657481)];
  for (const branch of [-1,1]) for (let i=0;i<22;i++) {
    const t=-.95+i*.086+random()*.035;
    const position=point(t,branch);
    const tangent=point(t+.001,branch).sub(position).normalize();
    const angle=Math.atan2(-tangent.z,tangent.x);
    const lane=i%2===0?-1:1;
    const x=position.x-tangent.z*lane*3.2;
    const z=position.z+tangent.x*lane*3.2;
    const y=position.y+1.75;
    box(x,y,z,3.8,.8,1.55,carPaint[i%carPaint.length]).rotation.y=angle;
    for (const side of [-1,1]) {
      const offset=lane*1.87;
      box(x+tangent.x*offset-tangent.z*side*.52,y+.06,z+tangent.z*offset+tangent.x*side*.52,.25,.24,.25,lane>0?white:red);
    }
    if (i%3===0) {
      const pole=position.clone().add(vector(-tangent.z*7.2,1.3,tangent.x*7.2));
      rod(pole,pole.clone().add(vector(0,8,0)),.13,concrete);
      box(pole.x,pole.y+8,pole.z,1.1,.30,.75,amber);
    }
  }

  const reflection = new THREE.MeshBasicMaterial({color:0xeaa359,transparent:true,opacity:.17,depthWrite:false});
  for (let i=0;i<110;i++) {
    const x=(random()-.5)*195, z=(random()-.5)*330;
    box(x,.06,z,1+random()*4,.04,2+random()*23,reflection);
  }

  const shots = [
    { at:0, eye:vector(172,167,245), target:vector(-65,55,-55) },
    { at:.34, eye:vector(128,108,151), target:vector(-67,53,-31) },
    { at:.73, eye:vector(146,27,78), target:vector(-65,39,-25) },
    { at:1, eye:vector(184,110,192), target:vector(2,36,5) },
  ];
  let frame = 0;
  function paint() {
    frame=0;
    const rect=story.getBoundingClientRect();
    if (rect.bottom<=0 || rect.top>=innerHeight) return;
    const progress=THREE.MathUtils.clamp(-rect.top/(rect.height-innerHeight),0,1);
    const index=Math.max(0,shots.findIndex((shot,i)=>i>0&&progress<=shot.at)-1);
    const first=shots[index], last=shots[index+1];
    const t=THREE.MathUtils.smoothstep(progress,first.at,last.at);
    camera.position.copy(first.eye).lerp(last.eye,t);
    camera.lookAt(first.target.clone().lerp(last.target,t));
    story.style.setProperty('--journey-progress',progress.toFixed(3));
    renderer.render(scene,camera);
  }
  function requestPaint() { if (!frame) frame=requestAnimationFrame(paint); }
  function resize() {
    const {clientWidth:width,clientHeight:height}=host;
    camera.aspect=width / Math.max(height,1);
    camera.updateProjectionMatrix();
    renderer.setSize(width,height,false);
    requestPaint();
  }
  addEventListener('scroll',requestPaint,{ passive:true });
  new ResizeObserver(resize).observe(host);
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    renderer.domElement.hidden=true;
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    renderer.domElement.hidden=false;
    requestPaint();
  });
  resize();
}
