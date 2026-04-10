import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

const StepViewer3D = ({ fileUrl, fileName, onClose }) => {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState('Initializing viewer...');
  const [error, setError] = useState(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f4f8);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, containerRef.current.clientWidth / containerRef.current.clientHeight, 0.01, 100000);
    camera.position.set(0, 0, 500);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 0.1;
    controls.maxDistance = 50000;
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dir1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dir1.position.set(1, 2, 3);
    scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.4);
    dir2.position.set(-2, -1, -1);
    scene.add(dir2);
    scene.add(new THREE.HemisphereLight(0xddeeff, 0x222233, 0.3));
    scene.add(new THREE.GridHelper(2000, 40, 0xaaaaaa, 0xdddddd));

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
  }, [fileUrl, fileName]);

  const loadStepFile = async (url, scene, camera, controls) => {
    try {
      setLoading(true);
      setLoadingMsg('Downloading STEP file...');
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch file: ' + response.statusText);
      const arrayBuffer = await response.arrayBuffer();
      const fileBuffer = new Uint8Array(arrayBuffer);

      setLoadingMsg('Loading STEP parser (first load may take a moment)...');
      let initOpenCascade;
      try {
        const mod = await import('occt-import-js');
        initOpenCascade = mod.default;
      } catch (e) {
        throw new Error('STEP parser library not available. Please ensure occt-import-js is installed.');
      }

      setLoadingMsg('Parsing STEP geometry...');
      const occt = await initOpenCascade({
        locateFile: (filename) => `/${filename}`
      });
      const result = occt.ReadStepFile(fileBuffer, null);

      if (!result || !result.meshes || result.meshes.length === 0) {
        throw new Error('No geometry found in STEP file.');
      }

      setLoadingMsg('Building 3D model...');
      const colors = [0x4a90e2, 0x7ecba1, 0xf59e0b, 0xe05c5c, 0x9b59b6, 0x1abc9c];
      const group = new THREE.Group();

      result.meshes.forEach((mesh, idx) => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(mesh.attributes.position.array), 3));
        if (mesh.attributes.normal) {
          geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(mesh.attributes.normal.array), 3));
        }
        if (mesh.index) {
          geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(mesh.index.array), 1));
        }
        if (!mesh.attributes.normal) geometry.computeVertexNormals();

        const color = mesh.color
          ? new THREE.Color(mesh.color[0], mesh.color[1], mesh.color[2])
          : new THREE.Color(colors[idx % colors.length]);

        const mat = new THREE.MeshPhongMaterial({ color, shininess: 80, specular: new THREE.Color(0x333333), side: THREE.DoubleSide });
        group.add(new THREE.Mesh(geometry, mat));

        const edges = new THREE.EdgesGeometry(geometry, 15);
        group.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000, opacity: 0.15, transparent: true })));
      });

      scene.add(group);

      const box = new THREE.Box3().setFromObject(group);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const cameraDistance = Math.abs(maxDim / Math.tan(camera.fov * Math.PI / 360)) * 1.5;

      camera.position.set(center.x + cameraDistance * 0.5, center.y + cameraDistance * 0.4, center.z + cameraDistance);
      controls.target.copy(center);
      controls.update();

      camera.userData.initialPosition = camera.position.clone();
      camera.userData.initialTarget = center.clone();

      setLoading(false);
    } catch (err) {
      console.error('Error loading STEP file:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  const handleResetView = () => {
    if (cameraRef.current && controlsRef.current) {
      const cam = cameraRef.current;
      if (cam.userData.initialPosition) {
        cam.position.copy(cam.userData.initialPosition);
        controlsRef.current.target.copy(cam.userData.initialTarget);
      } else {
        cam.position.set(0, 0, 500);
        controlsRef.current.target.set(0, 0, 0);
      }
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
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.8rem', cursor: 'pointer', color: '#999', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}
            onMouseEnter={e => e.currentTarget.style.background = '#f0f0f0'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >✕</button>
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
