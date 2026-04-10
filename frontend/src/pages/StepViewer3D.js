import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

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

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const d1 = new THREE.DirectionalLight(0xffffff, 0.9);
    d1.position.set(5, 10, 7);
    scene.add(d1);
    const d2 = new THREE.DirectionalLight(0xffffff, 0.4);
    d2.position.set(-5, -5, -5);
    scene.add(d2);

    loadStepFile(fileUrl, scene, camera, controls);

    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      controls.update();
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
      renderer.dispose();
      controls.dispose();
    };
  }, [fileUrl]);

  const loadStepFile = async (url, scene, camera, controls) => {
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
        const normals = mesh.attributes.normal
          ? new Float32Array(mesh.attributes.normal.array)
          : null;
        const indices = mesh.index ? new Uint32Array(mesh.index.array) : null;

        const meshColor = mesh.color
          ? new THREE.Color(mesh.color[0], mesh.color[1], mesh.color[2])
          : new THREE.Color(palette[meshIdx % palette.length]);

        // Check if any faces have per-face colors (using correct 'first'/'last' keys)
        const hasFaceColors = mesh.brep_faces &&
          mesh.brep_faces.some(f => f.color !== null && f.color !== undefined);

        if (hasFaceColors && indices && mesh.brep_faces) {
          // Render each face group separately with its own color
          mesh.brep_faces.forEach((face) => {
            // face.first / face.last are TRIANGLE indices — multiply by 3 for buffer positions
            if (face.first === undefined || face.last === undefined) return;
            const bufStart = face.first * 3;
            const bufEnd = (face.last + 1) * 3;
            const faceIndices = indices.slice(bufStart, bufEnd);
            if (faceIndices.length === 0) return;

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            if (normals) geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
            geo.setIndex(new THREE.BufferAttribute(faceIndices, 1));
            if (!normals) geo.computeVertexNormals();

            const faceColor = (face.color && face.color.length >= 3)
              ? new THREE.Color(face.color[0], face.color[1], face.color[2])
              : meshColor.clone();

            group.add(new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
              color: faceColor,
              shininess: 70,
              side: THREE.DoubleSide,
              polygonOffset: true,
              polygonOffsetFactor: 1,
              polygonOffsetUnits: 1,
            })));
          });
        } else {
          // Single color for whole mesh
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
          if (normals) geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
          if (indices) geo.setIndex(new THREE.BufferAttribute(indices, 1));
          if (!normals) geo.computeVertexNormals();

          group.add(new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
            color: meshColor,
            shininess: 70,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1,
          })));
        }

        // Edge lines over full mesh
        if (indices) {
          const edgeGeo = new THREE.BufferGeometry();
          edgeGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
          edgeGeo.setIndex(new THREE.BufferAttribute(indices, 1));
          group.add(new THREE.LineSegments(
            new THREE.EdgesGeometry(edgeGeo, 20),
            new THREE.LineBasicMaterial({ color: 0x111111, opacity: 0.25, transparent: true })
          ));
        }
      });

      scene.add(group);

      // Fit camera to model
      const box = new THREE.Box3().setFromObject(group);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const dist = Math.abs(Math.max(size.x, size.y, size.z) / Math.tan(camera.fov * Math.PI / 360)) * 1.6;
      camera.position.set(center.x + dist * 0.5, center.y + dist * 0.4, center.z + dist);
      camera.userData.initialPosition = camera.position.clone();
      camera.userData.initialTarget = center.clone();
      controls.target.copy(center);
      controls.update();

      setLoading(false);
    } catch (err) {
      console.error('Error loading STEP:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  const handleResetView = () => {
    const cam = cameraRef.current;
    if (cam && controlsRef.current && cam.userData.initialPosition) {
      cam.position.copy(cam.userData.initialPosition);
      controlsRef.current.target.copy(cam.userData.initialTarget);
      controlsRef.current.update();
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div style={{ background: 'white', borderRadius: '12px', width: '100%', maxWidth: '1200px', height: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 70px rgba(0,0,0,0.4)' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafa' }}>
          <div>
            <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.4rem' }}>🎨 3D Viewer</h2>
            <p style={{ margin: 0, color: '#888', fontSize: '0.85rem' }}>{fileName}</p>
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '1.8rem', cursor: 'pointer', color: '#999', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}
            onMouseEnter={e => e.currentTarget.style.background = '#f0f0f0'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}>✕</button>
        </div>
        <div style={{ padding: '0.75rem 1.5rem', background: '#fafafa', borderBottom: '1px solid #e0e0e0', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button onClick={handleResetView} style={{ padding: '0.4rem 1rem', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem' }}>
            🔄 Reset View
          </button>
          <div style={{ color: '#777', fontSize: '0.82rem' }}>
            <strong>Controls:</strong> Left-click + drag to rotate &nbsp;•&nbsp; Right-click + drag to pan &nbsp;•&nbsp; Scroll to zoom
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
      <style>{`@keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }`}</style>
    </div>
  );
};

export default StepViewer3D;
