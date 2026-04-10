import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

const StepViewer3D = ({ fileUrl, fileName, onClose }) => {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    console.log('🎨 INITIALIZING 3D VIEWER');
    console.log('File URL:', fileUrl);
    console.log('File name:', fileName);

    // Setup scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    sceneRef.current = scene;

    // Setup camera
    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      10000
    );
    camera.position.set(0, 0, 500);
    cameraRef.current = camera;

    // Setup renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Setup controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 10;
    controls.maxDistance = 5000;
    controlsRef.current = controls;

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight1.position.set(1, 1, 1);
    scene.add(directionalLight1);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight2.position.set(-1, -1, -1);
    scene.add(directionalLight2);

    // Add grid
    const gridHelper = new THREE.GridHelper(1000, 20, 0x888888, 0xcccccc);
    scene.add(gridHelper);

    // Add axes helper
    const axesHelper = new THREE.AxesHelper(200);
    scene.add(axesHelper);

    // Load STEP file (simplified - shows placeholder cube)
    // Note: Full STEP parsing requires OpenCascade.js or similar
    loadStepFile(fileUrl, scene, camera, controls);

    // Animation loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
      controls.dispose();
    };
  }, [fileUrl, fileName]);

  const loadStepFile = async (url, scene, camera, controls) => {
    try {
      setLoading(true);
      console.log('📥 Loading STEP file from:', url);

      // For STEP files, we'll show a message and create a placeholder
      // In production, you'd use OpenCascade.js or a STEP parser
      
      // Create a placeholder geometry for demonstration
      const geometry = new THREE.BoxGeometry(100, 100, 100);
      const material = new THREE.MeshPhongMaterial({ 
        color: 0x4a90e2,
        shininess: 100,
        specular: 0x111111
      });
      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);

      // Add wireframe overlay
      const wireframe = new THREE.WireframeGeometry(geometry);
      const line = new THREE.LineSegments(wireframe);
      line.material.color.setHex(0x000000);
      line.material.opacity = 0.3;
      line.material.transparent = true;
      scene.add(line);

      // Fit camera to object
      const box = new THREE.Box3().setFromObject(mesh);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      
      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = camera.fov * (Math.PI / 180);
      let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
      cameraZ *= 2; // Add some padding
      
      camera.position.set(center.x, center.y, center.z + cameraZ);
      controls.target.copy(center);
      controls.update();

      setLoading(false);
      setError('STEP file preview - Full parsing requires additional libraries');
      
      console.log('✅ 3D view ready (placeholder)');

    } catch (err) {
      console.error('❌ Error loading STEP file:', err);
      setError('Failed to load 3D model: ' + err.message);
      setLoading(false);
    }
  };

  const handleResetView = () => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(0, 0, 500);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.8)',
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '1200px',
        height: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid #e0e0e0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#f9f9f9'
        }}>
          <div>
            <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.5rem' }}>
              🎨 3D Viewer
            </h2>
            <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>
              {fileName}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '2rem',
              cursor: 'pointer',
              color: '#666',
              padding: 0,
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#f0f0f0'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
          >
            ✕
          </button>
        </div>

        {/* Controls */}
        <div style={{
          padding: '1rem 1.5rem',
          background: '#f9f9f9',
          borderBottom: '1px solid #e0e0e0',
          display: 'flex',
          gap: '1rem',
          alignItems: 'center'
        }}>
          <button
            onClick={handleResetView}
            style={{
              padding: '0.5rem 1rem',
              background: '#f59e0b',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.9rem'
            }}
          >
            🔄 Reset View
          </button>
          <div style={{ color: '#666', fontSize: '0.85rem' }}>
            <strong>Controls:</strong> Left-click + drag to rotate • R