import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import initOpenCascade from 'opencascade.js';

const StepViewer3D = ({ fileUrl, fileName, onClose }) => {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Initializing 3D engine...');
  const [error, setError] = useState(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const animationFrameRef = useRef(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;

    console.log('🎨 INITIALIZING 3D VIEWER WITH OPENCASCADE');
    console.log('File URL:', fileUrl);
    console.log('File name:', fileName);

    let cleanup = false;

    // Setup scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f5f5);
    sceneRef.current = scene;

    // Setup camera
    const camera = new THREE.PerspectiveCamera(
      50,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      100000
    );
    camera.position.set(500, 500, 500);
    cameraRef.current = camera;

    // Setup renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Setup controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = true;
    controls.minDistance = 1;
    controls.maxDistance = 50000;
    controls.maxPolarAngle = Math.PI;
    controlsRef.current = controls;

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight1.position.set(100, 100, 100);
    directionalLight1.castShadow = true;
    scene.add(directionalLight1);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    directionalLight2.position.set(-100, -100, -100);
    scene.add(directionalLight2);

    const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
    scene.add(hemisphereLight);

    // Add grid
    const gridHelper = new THREE.GridHelper(2000, 40, 0x888888, 0xdddddd);
    scene.add(gridHelper);

    // Add axes helper
    const axesHelper = new THREE.AxesHelper(500);
    scene.add(axesHelper);

    // Load STEP file
    loadStepFile(fileUrl, scene, camera, controls, setLoadingMessage, setProgress).then(() => {
      if (!cleanup) {
        setLoading(false);
      }
    }).catch(err => {
      if (!cleanup) {
        console.error('❌ Error loading STEP file:', err);
        setError('Failed to load 3D model: ' + err.message);
        setLoading(false);
      }
    });

    // Animation loop
    const animate = () => {
      if (cleanup) return;
      animationFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current || cleanup) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      cleanup = true;
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (containerRef.current && renderer.domElement && containerRef.current.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
      controls.dispose();
    };
  }, [fileUrl, fileName]);

  const loadStepFile = async (url, scene, camera, controls, setMessage, setProgress) => {
    try {
      setMessage('Loading OpenCascade engine...');
      setProgress(10);
      console.log('🔧 Initializing OpenCascade.js...');

      // Initialize OpenCascade
      const oc = await initOpenCascade();
      console.log('✅ OpenCascade initialized');
      
      setMessage('Downloading STEP file...');
      setProgress(30);
      console.log('📥 Fetching STEP file from:', url);

      // Fetch the STEP file
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const fileBuffer = new Uint8Array(arrayBuffer);
      console.log('✅ File downloaded:', fileBuffer.length, 'bytes');

      setMessage('Parsing STEP geometry...');
      setProgress(50);
      console.log('🔍 Parsing STEP file...');

      // Write file to OpenCascade virtual filesystem
      oc.FS.writeFile('/file.step', fileBuffer);

      // Read the STEP file
      const reader = new oc.STEPControl_Reader_1();
      const readResult = reader.ReadFile('/file.step');
      
      if (readResult !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
        throw new Error('Failed to read STEP file');
      }

      console.log('✅ STEP file read successfully');
      
      setMessage('Converting to 3D mesh...');
      setProgress(70);

      // Transfer shapes
      reader.TransferRoots(new oc.Message_ProgressRange_1());
      const nbShapes = reader.NbShapes();
      console.log('📊 Number of shapes:', nbShapes);

      if (nbShapes === 0) {
        throw new Error('No shapes found in STEP file');
      }

      // Get the shape
      const shape = reader.Shape(1);
      console.log('✅ Shape extracted');

      // Mesh the shape
      const mesher = new oc.BRepMesh_IncrementalMesh_2(
        shape,
        0.1, // Linear deflection
        false,
        0.5, // Angular deflection
        true
      );

      console.log('✅ Shape meshed');
      setProgress(85);

      // Extract triangulation
      const vertices = [];
      const indices = [];
      let vertexOffset = 0;

      // Traverse faces
      const explorer = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
      
      while (explorer.More()) {
        const face = oc.TopoDS.Face_1(explorer.Current());
        const location = new oc.TopLoc_Location_1();
        const triangulation = oc.BRep_Tool.Triangulation(face, location);

        if (!triangulation.IsNull()) {
          const transformation = location.Transformation();
          const nodeCount = triangulation.get().NbNodes();
          const triangleCount = triangulation.get().NbTriangles();

          // Get vertices
          for (let i = 1; i <= nodeCount; i++) {
            const node = triangulation.get().Node(i);
            const transformed = node.Transformed(transformation);
            vertices.push(transformed.X(), transformed.Y(), transformed.Z());
          }

          // Get triangles
          const orient = face.Orientation_1();
          const reverse = orient === oc.TopAbs_Orientation.TopAbs_REVERSED;

          for (let i = 1; i <= triangleCount; i++) {
            const triangle = triangulation.get().Triangle(i);
            let i1 = triangle.Value(1) - 1 + vertexOffset;
            let i2 = triangle.Value(2) - 1 + vertexOffset;
            let i3 = triangle.Value(3) - 1 + vertexOffset;

            if (reverse) {
              indices.push(i1, i3, i2);
            } else {
              indices.push(i1, i2, i3);
            }
          }

          vertexOffset += nodeCount;
        }

        explorer.Next();
      }

      console.log('✅ Extracted vertices:', vertices.length / 3);
      console.log('✅ Extracted triangles:', indices.length / 3);

      setMessage('Rendering 3D model...');
      setProgress(95);

      // Create Three.js geometry
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();

      // Create material
      const material = new THREE.MeshPhongMaterial({
        color: 0x4a90e2,
        shininess: 80,
        specular: 0x222222,
        side: THREE.DoubleSide
      });

      // Create mesh
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);

      // Add edges
      const edges = new THREE.EdgesGeometry(geometry, 15);
      const lineMaterial = new THREE.LineBasicMaterial({ 
        color: 0x000000, 
        linewidth: 1,
        opacity: 0.3,
        transparent: true
      });
      const wireframe = new THREE.LineSegments(edges, lineMaterial);
      mesh.add(wireframe);

      console.log('✅ 3D model added to scene');

      // Fit camera to object
      const box = new THREE.Box3().setFromObject(mesh);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      
      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = camera.fov * (Math.PI / 180);
      let cameraZ = Math.abs(maxDim / Math.tan(fov / 2));
      cameraZ *= 1.8; // Add padding
      
      camera.position.set(
        center.x + cameraZ * 0.5,
        center.y + cameraZ * 0.5,
        center.z + cameraZ * 0.7
      );
      
      controls.target.copy(center);
      controls.update();

      // Update grid position
      const grid = scene.children.find(child => child instanceof THREE.GridHelper);
      if (grid) {
        grid.position.y = box.min.y;
      }

      setProgress(100);
      console.log('🎉 STEP file loaded successfully!');

    } catch (err) {
      console.error('❌ Error in loadStepFile:', err);
      throw err;
    }
  };

  const handleResetView = () => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(500, 500, 500);
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
      background: 'rgba(0,0,0,0.85)',
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
        maxWidth: '1400px',
        height: '95vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 25px 80px rgba(0,0,0,0.4)'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid #e0e0e0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white'
        }}>
          <div>
            <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.5rem' }}>
              🎨 3D Viewer
            </h2>
            <p style={{ margin: 0, opacity: 0.9, fontSize: '0.9rem' }}>
              {fileName}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: '2px solid rgba(255,255,255,0.3)',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: 'white',
              padding: 0,
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              transition: 'all 0.2s',
              fontWeight: 'bold'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
              e.currentTarget.style.transform = 'scale(1.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
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
          alignItems: 'center',
          flexWrap: 'wrap'
        }}>
          <button
            onClick={handleResetView}
            disabled={loading}
            style={{
              padding: '0.6rem 1.2rem',
              background: loading ? '#ccc' : '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: '600',
              fontSize: '0.9rem',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.background = '#7c3aed';
            }}
            onMouseLeave={(e) => {
              if (!loading) e.currentTarget.style.background = '#8b5cf6';
            }}
          >
            🔄 Reset View
          </button>
          <div style={{ color: '#666', fontSize: '0.85rem', flex: 1 }}>
            <strong>Controls:</strong> Left-click + drag to rotate • Right-click + drag to pan • Scroll to zoom
          </div>
        </div>

        {/* 3D Canvas Container */}
        <div style={{ flex: 1, position: 'relative' }}>
          {loading && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255,255,255,0.95)',
              zIndex: 10
            }}>
              <div style={{ textAlign: 'center', maxWidth: '400px' }}>
                <div style={{
                  width: '80px',
                  height: '80px',
                  border: '6px solid #f3f3f3',
                  borderTop: '6px solid #8b5cf6',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  margin: '0 auto 1.5rem'
                }}></div>
                <p style={{ 
                  fontSize: '1.1rem', 
                  fontWeight: '600',
                  color: '#333',
                  margin: '0 0 0.5rem 0'
                }}>
                  {loadingMessage}
                </p>
                <div style={{
                  width: '100%',
                  height: '8px',
                  background: '#e0e0e0',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  marginTop: '1rem'
                }}>
                  <div style={{
                    width: `${progress}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #8b5cf6, #7c3aed)',
                    transition: 'width 0.3s ease',
                    borderRadius: '4px'
                  }}></div>
                </div>
                <p style={{ 
                  fontSize: '0.85rem', 
                  color: '#666',
                  marginTop: '0.5rem'
                }}>
                  {progress}%
                </p>
              </div>
            </div>
          )}

          {error && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: '#fee',
              border: '2px solid #fcc',
              color: '#c33',
              padding: '1.5rem 2rem',
              borderRadius: '8px',
              zIndex: 10,
              maxWidth: '80%',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>⚠️</div>
              <strong style={{ display: 'block', marginBottom: '0.5rem' }}>
                Failed to load 3D model
              </strong>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>{error}</p>
            </div>
          )}

          <div 
            ref={containerRef} 
            style={{ 
              width: '100%', 
              height: '100%',
              background: '#f5f5f5'
            }} 
          />
        </div>
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default StepViewer3D;
