import { useEffect, useRef, useState } from 'react';

export default function OperationsCore() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    const node = canvas.current;
    const sceneElement = sceneRef.current;
    if (!sceneElement) return;
    const mobile = matchMedia('(max-width: 640px)');
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const gl = node?.getContext('webgl', { alpha: true, antialias: false });
    if (!node || !gl) { setFallback(true); return; }
    const shaders: WebGLShader[] = [];
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('Shader unavailable');
      return shader;
    };
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    let frame = 0;
    const pointer = { x: 0, y: 0 };
    try {
      program = gl.createProgram()!;
      gl.attachShader(program, compile(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, `
        precision mediump float;
        uniform vec2 resolution; uniform vec2 pointer; uniform float time; uniform float scrollProgress;
        mat2 rot(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
        float scene(vec3 p){
          p.xz=rot(time*.22+pointer.x*.3)*p.xz;
          p.yz=rot(.55+pointer.y*.2)*p.yz;
          float crystal=(abs(p.x)+abs(p.y)+abs(p.z)-1.15)*.577;
          float ring=length(vec2(length(p.xz)-1.6,p.y))-.018;
          return min(crystal,ring);
        }
        void main(){
          vec2 uv=(gl_FragCoord.xy*2.-resolution)/resolution.y;
          vec3 ro=vec3(0.,0.,4.7+scrollProgress*.9),rd=normalize(vec3(uv,-2.8));
          ro.yz=rot(scrollProgress*.18)*ro.yz;rd.yz=rot(scrollProgress*.18)*rd.yz;
          float t=0.;float glow=0.;bool hit=false;
          for(int i=0;i<72;i++){float d=scene(ro+rd*t);glow+=.0008/(.012+abs(d));if(d<.002){hit=true;break;}t+=d*.8;if(t>9.)break;}
          vec3 color=vec3(.025,.04,.075);
          if(hit){vec3 p=ro+rd*t;vec2 e=vec2(.003,0.);vec3 n=normalize(vec3(scene(p+e.xyy)-scene(p-e.xyy),scene(p+e.yxy)-scene(p-e.yxy),scene(p+e.yyx)-scene(p-e.yyx)));float light=max(dot(n,normalize(vec3(-2.,3.,4.))),0.);float rim=pow(1.-abs(dot(n,-rd)),3.);vec3 base=mix(vec3(.12,.14,.32),vec3(.18,.30,.62),light);
          float reflection=pow(max(dot(reflect(-normalize(vec3(-2.,3.,4.)),n),-rd),0.),24.);
          color=base*(.3+light*.7)+vec3(.40,.56,.85)*rim*.45+vec3(.65,.76,.95)*reflection*.22;}
          color+=vec3(.045,.095,.22)*glow;
          float fade=1.-smoothstep(.65,1.7,length(uv));
          gl_FragColor=vec4(color*fade,fade);
        }`));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('WebGL unavailable');
      gl.useProgram(program);
      buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'p');
      gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      const res = gl.getUniformLocation(program, 'resolution'), time = gl.getUniformLocation(program, 'time'), mouse = gl.getUniformLocation(program, 'pointer');
      const scrollUniform = gl.getUniformLocation(program, 'scrollProgress');
      const start = performance.now();
      let visible = true;
      let disposed = false;
      let lastDraw = 0;
      let progress = 0;
      let width = 1, height = 1;
      const workflow = document.getElementById('operations-workflow');
      const updateScroll = () => {
        const rect = sceneElement.getBoundingClientRect();
        const end = workflow?.getBoundingClientRect().top ?? rect.bottom;
        const distance = Math.max(1, end - rect.top);
        progress = motion.matches ? 0 : Math.max(0, Math.min(1, (innerHeight * .65 - rect.top) / distance));
      };
      const paths = Array.from(sceneElement.querySelectorAll<SVGPathElement>('.operations-connection'));
      const panels = Array.from(sceneElement.querySelectorAll<HTMLElement>('.operations-node'));
      const resize = () => {
        const ratio = Math.min(devicePixelRatio, mobile.matches ? 1 : 1.5);
        width = Math.max(1, Math.round(node.clientWidth * ratio));
        height = Math.max(1, Math.round(node.clientHeight * ratio));
        node.width = width; node.height = height;
        // Use layout coordinates so panel floating does not trigger layout reads every frame.
        panels.forEach((panel, index) => {
          const x = panel.offsetLeft + panel.offsetWidth / 2;
          const y = panel.offsetTop + panel.offsetHeight / 2;
          const cx = sceneElement.clientWidth / 2, cy = sceneElement.clientHeight / 2;
          const d = `M ${x} ${y} Q ${cx} ${y} ${cx} ${cy}`;
          paths.filter(path => path.dataset.panel === String(index)).forEach(path => path.setAttribute('d', d));
        });
        updateScroll(); schedule();
      };
      const render = (now: number) => {
        frame = 0;
        if (disposed || !visible || document.hidden) return;
        if (now - lastDraw >= (mobile.matches ? 1000 / 24 : 1000 / 30) || motion.matches) {
          lastDraw = now;
          gl.viewport(0, 0, width, height);
          gl.uniform2f(res, width, height);
          gl.uniform2f(mouse, motion.matches || mobile.matches ? 0 : pointer.x, motion.matches || mobile.matches ? 0 : pointer.y);
          gl.uniform1f(time, motion.matches ? 0 : (now - start) / 1000);
          gl.uniform1f(scrollUniform, progress);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
        if (!motion.matches) schedule();
      };
      const schedule = () => {
        if (!disposed && visible && !document.hidden && !frame) frame = requestAnimationFrame(render);
      };
      const scroll = () => { updateScroll(); schedule(); };
      const move = (event: PointerEvent) => {
        if (motion.matches || mobile.matches) return;
        const rect = node.getBoundingClientRect();
        pointer.x = (event.clientX - rect.left) / rect.width - .5;
        pointer.y = (event.clientY - rect.top) / rect.height - .5;
      };
      const reset = () => { pointer.x = 0; pointer.y = 0; };
      const visibility = () => {
        if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
        else schedule();
      };
      const observer = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        sceneElement.dataset.visible = String(visible);
        if (!visible) { cancelAnimationFrame(frame); frame = 0; }
        else schedule();
      });
      const resizeObserver = new ResizeObserver(resize);
      observer.observe(sceneElement);
      resizeObserver.observe(sceneElement);
      panels.forEach(panel => resizeObserver.observe(panel));
      const contextLost = (event: Event) => { event.preventDefault(); cancelAnimationFrame(frame); frame = 0; visible = false; setFallback(true); };
      node.addEventListener('webglcontextlost', contextLost);
      sceneElement.addEventListener('pointermove', move);
      sceneElement.addEventListener('pointerleave', reset);
      window.addEventListener('scroll', scroll, { passive: true });
      window.addEventListener('resize', resize);
      document.addEventListener('visibilitychange', visibility);
      motion.addEventListener('change', resize);
      mobile.addEventListener('change', resize);
      resize();
      return () => {
        disposed = true; cancelAnimationFrame(frame);
        observer.disconnect(); resizeObserver.disconnect();
        node.removeEventListener('webglcontextlost', contextLost);
        sceneElement.removeEventListener('pointermove', move);
        sceneElement.removeEventListener('pointerleave', reset);
        window.removeEventListener('scroll', scroll);
        window.removeEventListener('resize', resize);
        document.removeEventListener('visibilitychange', visibility);
        motion.removeEventListener('change', resize);
        mobile.removeEventListener('change', resize);
        shaders.forEach(shader => gl.deleteShader(shader));
        gl.deleteBuffer(buffer); gl.deleteProgram(program);
      };
    } catch {
      shaders.forEach(s => gl.deleteShader(s)); gl.deleteBuffer(buffer); gl.deleteProgram(program); setFallback(true);
    }
  }, []);
  return <div ref={sceneRef} className="operations-scene" aria-label="Illustration of FlowPilot connecting studio operations">
    <canvas ref={canvas} className="operations-canvas" aria-hidden="true" />
    <svg className="operations-connections" aria-hidden="true">
      {[0, 1, 2, 3, 4].map(index => <g key={index}>
        <path d={`M ${[20, 80, 15, 85, 50][index]} ${[25, 22, 70, 65, 85][index]} Q 50 50 50 50`} data-panel={index} className="operations-connection operations-connection-base" />
        <path data-panel={index} pathLength="100" className="operations-connection operations-connection-flow" style={{ animationDelay: `-${index * .7}s` }} />
      </g>)}
    </svg>
    {fallback && <div className="operations-fallback" aria-hidden="true">✦</div>}
    {['People & teams', 'Project progress', 'Task ownership', 'AI assistant', 'Approvals & safety'].map((label, index) => <div key={label} className={`operations-node operations-node-${index}`}><span className="operations-dot" /><span>{label}</span><small>Connected workflow</small></div>)}
    <div className="operations-caption">FLOWPILOT OPERATIONS CORE <span>Illustrative visualization</span></div>
  </div>;
}
