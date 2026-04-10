import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';


// Build a single mesh with vertex colors to avoid z-fighting entirely
function buildColoredMesh(mesh, meshColor, palette, meshIdx) {
  const positions = new Float32Array(mesh.attributes.position.array);
  const indices = mesh.index ? new Uint32Array(mesh.index.array) : null;
  const triCount = indices ? indices.length / 3 : positions.length / 9;

  // Assign a color to every triangle based on which brep_face owns it
  const triColors = new Array(triCount).fill(null).map(() => meshColor.clone());

  if (mesh.brep_faces) {
    mesh.brep_faces.forEach((face) => {
      if (face.first === undefined || face.last === undefined) return;
      const faceColor = (face.color && face.color.length >= 3)
        ? new THREE.Color(face.color[0], face.color[1], face.color[2])
        : meshColor.clone();
      for (let t = face.first; t <= face.last; t++) {
        triColors[t] = faceColor;
      }
    });
  }

  // Build expanded (non-indexed) buffers so each triangle vertex gets its own color
  const vertCount = triCount * 3;
  const newPos   = new Float32Array(vertCount * 3);
  const newColor = new Float32Array(vertCount * 3);

  for (let t = 0; t < triCount; t++) {
    const c = triColors[t];
    for (let v = 0; v < 3; v++) {
      const srcIdx = indices ? indices[t * 3 + v] : t * 3 + v;
      const dstIdx = t * 3 + v;
      newPos[dstIdx * 3]     = positions[srcIdx * 3];
      newPos[dstIdx * 3 + 1] = positions[srcIdx * 3 + 1];
      newPos[dstIdx * 3 + 2] = positions[srcIdx * 3 + 2];
      newColor[dstIdx * 3]     = c.r;
      newColor[dstIdx * 3 + 1] = c.g;
      newColor[dstIdx * 3 + 2] = c.b;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(newPos, 3));
  geo.setAttribute('color',    new THREE.BufferAttribute(newColor, 3));
  geo.computeVertexNormals(); // needed for FrontSide culling
  return geo;
}

const StepViewer3D = ({ fileUrl, fileName, onClose }) => {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState('Initializing viewer...');
  const [error, setError] = useState(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const w = containerRef.current.clientWidth;
    const h = containerRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe8ecf0);

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 100000);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Custom arcball — zero stops, works on mouse and touch
    const state = { dragging: false, panning: false, lastX: 0, lastY: 0, lastDist: 0 };
    const groupRef = { current: null }; // set after model loads
    controlsRef.current = { target: new THREE.Vector3(), groupRef, update: () => {} };

    const getXY = (e) => {
      if (e.touches && e.touches.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      return { x: e.clientX, y: e.clientY };
    };

    const onDown = (e) => {
      const { x, y } = getXY(e);
      state.dragging = true;
      state.panning = e.button === 2 || (e.touches && e.touches.length === 2);
      state.lastX = x; state.lastY = y;
      if (e.touches && e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        state.lastDist = Math.sqrt(dx*dx + dy*dy);
      }
    };

    const onMove = (e) => {
      if (!state.dragging || !groupRef.current) return;
      e.preventDefault();
      const { x, y } = getXY(e);
      const dx = x - state.lastX;
      const dy = y - state.lastY;

      if (e.touches && e.touches.length === 2) {
        // Pinch zoom
        const dist = Math.sqrt(
          Math.pow(e.touches[0].clientX - e.touches[1].clientX, 2) +
          Math.pow(e.touches[0].clientY - e.touches[1].clientY, 2)
        );
        const delta = (state.lastDist - dist) * 0.5;
        camera.position.multiplyScalar(1 + delta * 0.01);
        state.lastDist = dist;
      } else if (state.panning) {
        // Pan — move camera sideways
        const panSpeed = camera.position.length() * 0.001;
        camera.position.x -= dx * panSpeed;
        camera.position.y += dy * panSpeed;
      } else {
        // Free arcball rotation — rotate the group, no stops ever
        const rotY = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0).applyQuaternion(groupRef.current.quaternion.clone().invert()),
          dx * 0.01
        );
        const rotX = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(1, 0, 0).applyQuaternion(groupRef.current.quaternion.clone().invert()),
          dy * 0.01
        );
        groupRef.current.quaternion.premultiply(
          new THREE.Quaternion().multiplyQuaternions(rotY, rotX)
        );
      }
      state.lastX = x; state.lastY = y;
    };

    const onUp = () => { state.dragging = false; };

    const onWheel = (e) => {
      e.preventDefault();
      camera.position.multiplyScalar(1 + e.deltaY * 0.001);
    };

    const onContext = (e) => { e.preventDefault(); state.dragging = true; state.panning = true; state.lastX = e.clientX; state.lastY = e.clientY; };

    renderer.domElement.addEventListener('mousedown',   onDown);
    renderer.domElement.addEventListener('touchstart',  onDown,  { passive: false });
    renderer.domElement.addEventListener('mousemove',   onMove);
    renderer.domElement.addEventListener('touchmove',   onMove,  { passive: false });
    renderer.domElement.addEventListener('mouseup',     onUp);
    renderer.domElement.addEventListener('touchend',    onUp);
    renderer.domElement.addEventListener('wheel',       onWheel, { passive: false });
    renderer.domElement.addEventListener('contextmenu', onContext);

    // No lights needed - MeshBasicMaterial renders pure vertex colors

    loadStepFile(fileUrl, scene, camera);

    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (containerRef.current && renderer.domElement) containerRef.current.removeChild(renderer.domElement);
      renderer.domElement.removeEventListener('mousedown',   onDown);
      renderer.domElement.removeEventListener('touchstart',  onDown);
      renderer.domElement.removeEventListener('mousemove',   onMove);
      renderer.domElement.removeEventListener('touchmove',   onMove);
      renderer.domElement.removeEventListener('mouseup',     onUp);
      renderer.domElement.removeEventListener('touchend',    onUp);
      renderer.domElement.removeEventListener('wheel',       onWheel);
      renderer.domElement.removeEventListener('contextmenu', onContext);
      renderer.dispose();
    };
  }, [fileUrl]);

  const loadStepFile = async (url, scene, camera) => {
    try {
      setLoading(true);
      setLoadingMsg('Downloading STEP file...');
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch: ' + response.statusText);
      const arrayBuffer = await response.arrayBuffer();

      setLoadingMsg('Loading STEP parser...');
      const mod = await import('occt-import-js');
      const occt = await mod.default({ locateFile: (f) => `/${f}` });

      setLoadingMsg('Parsing STEP geometry...');
      const result = occt.ReadStepFile(new Uint8Array(arrayBuffer), null);
      if (!result || !result.meshes || result.meshes.length === 0)
        throw new Error('No geometry found in STEP file.');

      setLoadingMsg('Building 3D model...');
      const palette = [0x7a9cbf, 0x7ecba1, 0xf59e0b, 0xe05c5c, 0x9b59b6, 0x1abc9c];
      const group = new THREE.Group();

      result.meshes.forEach((mesh, meshIdx) => {
        const positions = new Float32Array(mesh.attributes.position.array);
        const indices = mesh.index ? new Uint32Array(mesh.index.array) : null;

        const meshColor = mesh.color
          ? new THREE.Color(mesh.color[0], mesh.color[1], mesh.color[2])
          : new THREE.Color(palette[meshIdx % palette.length]);

        // Single mesh with vertex colors — zero z-fighting
        const geo = buildColoredMesh(mesh, meshColor, palette, meshIdx);
        group.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
          vertexColors: true,
          side: THREE.FrontSide,
        })));

        // Edge lines over original indexed geometry
        if (indices) {
          const edgeGeo = new THREE.BufferGeometry();
          const positions2 = new Float32Array(mesh.attributes.position.array);
          edgeGeo.setAttribute('position', new THREE.BufferAttribute(positions2, 3));
          edgeGeo.setIndex(new THREE.BufferAttribute(indices, 1));
          group.add(new THREE.LineSegments(
            new THREE.EdgesGeometry(edgeGeo, 20),
            new THREE.LineBasicMaterial({ color: 0x000000, opacity: 0.5, transparent: true })
          ));
        }
      });

      scene.add(group);
      if (controlsRef.current && controlsRef.current.groupRef) controlsRef.current.groupRef.current = group;

      const box = new THREE.Box3().setFromObject(group);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const dist = Math.abs(Math.max(size.x, size.y, size.z) / Math.tan(camera.fov * Math.PI / 360)) * 1.6;
      camera.position.set(center.x + dist * 0.5, center.y + dist * 0.4, center.z + dist);
      camera.userData.initialPosition = camera.position.clone();
      camera.userData.initialTarget = center.clone();

      setLoading(false);
    } catch (err) {
      console.error('Error loading STEP:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  const handleResetView = () => {
    const cam = cameraRef.current;
    if (cam && cam.userData.initialPosition) {
      cam.position.copy(cam.userData.initialPosition);
      const g = controlsRef.current && controlsRef.current.groupRef && controlsRef.current.groupRef.current;
      if (g) g.quaternion.set(0, 0, 0, 1);
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(0px, 2vw, 1.5rem)' }}>
      <div style={{ background: 'white', borderRadius: '12px', width: '100%', maxWidth: '1200px', height: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 70px rgba(0,0,0,0.4)' }}>
        <div style={{ padding: 'clamp(0.5rem, 2vw, 1rem) clamp(0.75rem, 3vw, 1.5rem)', borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafa', gap: '0.75rem' }}>
          <p style={{ margin: 0, fontWeight: '600', fontSize: 'clamp(0.85rem, 2.5vw, 1rem)', color: '#333', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</p>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
            <button onClick={handleResetView} style={{ padding: '0.4rem 0.85rem', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
              🔄 Reset
            </button>
            <button onClick={onClose}
              style={{ background: 'none', border: 'none', fontSize: '1.6rem', cursor: 'pointer', color: '#999', width: '34px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f0f0f0'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>✕</button>
          </div>
        </div>
        <div style={{ flex: 1, position: 'relative' }}>
          {loading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.95)', zIndex: 10 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ border: '4px solid #f0f0f0', borderTop: '4px solid #f59e0b', borderRadius: '50%', width: '50px', height: '50px', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
                <p style={{ color: '#555', fontWeight: '500' }}>{loadingMsg}</p>
              </div>
            </div>
          )}
          {error && !loading && (
            <div style={{ position: 'absolute', top: '1rem', left: '50%', transform: 'translateX(-50%)', background: '#fff3cd', border: '1px solid #ffc107', color: '#856404', padding: '0.75rem 1.25rem', borderRadius: '8px', zIndex: 10, maxWidth: '80%', fontSize: '0.9rem', textAlign: 'center' }}>
              ⚠️ {error}
            </div>
          )}
          <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        </div>
      </div>
      <style>{`
        @keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
        @media (max-height: 500px) and (orientation: landscape) {
          :root { --controls-display: none; }
        }
      `}</style>
    </div>
  );
};

export default StepViewer3D;
