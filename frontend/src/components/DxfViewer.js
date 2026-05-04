// frontend/src/components/DxfViewer-Enhanced.js
// Enhanced 2D DXF Viewer with Layer Controls, Measurements, and Better UX
// Week 3 - Production Ready Version

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import DxfParser from 'dxf-parser';
import './FileViewers.css';

const DxfViewerEnhanced = ({ fileUrl, fileName, onClose, specialInstructions }) => {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [dxfData, setDxfData] = useState(null);
  const [layers, setLayers] = useState([]);
  const [measurementMode, setMeasurementMode] = useState(false);
  const [measurements, setMeasurements] = useState([]);
  const [showInstructions, setShowInstructions] = useState(true);
  
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const cameraRef = useRef(null);
  const animationFrameRef = useRef(null);
  const layerGroupsRef = useRef({});
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const measurementPointsRef = useRef([]);

  useEffect(() => {
    if (!fileUrl || !containerRef.current) return;

    initViewer();

    return () => {
      cleanup();
    };
  }, [fileUrl]);

  const initViewer = async () => {
    try {
      setLoading(true);
      setError('');
      setProgress(10);

      // Initialize Three.js scene for 2D viewing
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xffffff);
      sceneRef.current = scene;

      // Orthographic camera for 2D view
      const aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      const frustumSize = 10;
      const camera = new THREE.OrthographicCamera(
        frustumSize * aspect / -2,
        frustumSize * aspect / 2,
        frustumSize / 2,
        frustumSize / -2,
        0.1,
        1000
      );
      camera.position.set(0, 0, 10);
      camera.lookAt(0, 0, 0);
      cameraRef.current = camera;

      // Renderer with screenshot capability
      const renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        preserveDrawingBuffer: true
      });
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      containerRef.current.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      setProgress(30);

      // Controls (restricted to 2D)
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableRotate = false;
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.screenSpacePanning = true;
      controls.minZoom = 0.1;
      controls.maxZoom = 20;
      
      controls.touches = {
        ONE: THREE.TOUCH.PAN,
        TWO: THREE.TOUCH.DOLLY_PAN
      };
      
      controlsRef.current = controls;

      setProgress(50);

      // Load DXF file
      await loadDxfFile(fileUrl, scene, camera, controls);

      setProgress(90);

      // Click handler for measurements
      renderer.domElement.addEventListener('click', handleCanvasClick);
      renderer.domElement.addEventListener('touchend', handleCanvasClick);

      // Animation loop
      const animate = () => {
        animationFrameRef.current = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      // Handle window resize
      const handleResize = () => {
        if (!containerRef.current) return;
        
        const aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
        camera.left = frustumSize * aspect / -2;
        camera.right = frustumSize * aspect / 2;
        camera.top = frustumSize / 2;
        camera.bottom = frustumSize / -2;
        camera.updateProjectionMatrix();
        
        renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
      };
      window.addEventListener('resize', handleResize);

      setProgress(100);
      setLoading(false);

    } catch (err) {
      console.error('Error initializing viewer:', err);
      setError('Failed to initialize DXF viewer: ' + err.message);
      setLoading(false);
    }
  };

  const loadDxfFile = async (url, scene, camera, controls) => {
    try {
      setProgress(60);

      // Fetch the DXF file
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch DXF file');
      }
      
      const dxfText = await response.text();
      console.log('DXF file loaded, size:', dxfText.length, 'bytes');

      setProgress(70);

      // Parse DXF file
      const parser = new DxfParser();
      const dxf = parser.parseSync(dxfText);
      
      if (!dxf) {
        throw new Error('Failed to parse DXF file');
      }

      console.log('DXF parsed successfully:', dxf);
      setDxfData(dxf);

      setProgress(75);

      // Extract layer information
      const layerInfo = [];
      if (dxf.tables?.layer?.layers) {
        Object.keys(dxf.tables.layer.layers).forEach(layerName => {
          const layer = dxf.tables.layer.layers[layerName];
          layerInfo.push({
            name: layerName,
            color: layer.color || 7,
            visible: true,
            entityCount: 0
          });
        });
      }

      // Create geometry from DXF entities, organized by layer
      let totalEntityCount = 0;
      let bounds = {
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity
      };

      if (dxf.entities) {
        dxf.entities.forEach(entity => {
          try {
            const layerName = entity.layer || '0';
            
            // Create layer group if it doesn't exist
            if (!layerGroupsRef.current[layerName]) {
              const layerGroup = new THREE.Group();
              layerGroup.name = layerName;
              scene.add(layerGroup);
              layerGroupsRef.current[layerName] = layerGroup;
            }

            const object = createEntityGeometry(entity);
            if (object) {
              layerGroupsRef.current[layerName].add(object);
              totalEntityCount++;
              
              // Update layer entity count
              const layerIndex = layerInfo.findIndex(l => l.name === layerName);
              if (layerIndex >= 0) {
                layerInfo[layerIndex].entityCount++;
              }
              
              // Update bounds
              updateBounds(entity, bounds);
            }
          } catch (err) {
            console.warn('Failed to create geometry for entity:', entity.type, err);
          }
        });
      }

      setLayers(layerInfo);
      console.log('Layers:', layerInfo);
      console.log('Created', totalEntityCount, 'entity geometries');

      setProgress(85);

      // Fit camera to content
      if (bounds.minX !== Infinity) {
        const centerX = (bounds.minX + bounds.maxX) / 2;
        const centerY = (bounds.minY + bounds.maxY) / 2;
        const sizeX = bounds.maxX - bounds.minX;
        const sizeY = bounds.maxY - bounds.minY;
        const maxSize = Math.max(sizeX, sizeY) || 10;

        const aspect = camera.right / camera.top;
        const frustumSize = maxSize * 1.2;
        
        camera.left = frustumSize * aspect / -2;
        camera.right = frustumSize * aspect / 2;
        camera.top = frustumSize / 2;
        camera.bottom = frustumSize / -2;
        camera.position.set(centerX, centerY, 10);
        camera.updateProjectionMatrix();
        
        controls.target.set(centerX, centerY, 0);
        controls.update();
      }

      console.log('DXF file rendered successfully');

    } catch (err) {
      console.error('Error loading DXF file:', err);
      throw new Error('Failed to load DXF file: ' + err.message);
    }
  };

  const updateBounds = (entity, bounds) => {
    if (entity.vertices) {
      entity.vertices.forEach(v => {
        bounds.minX = Math.min(bounds.minX, v.x);
        bounds.minY = Math.min(bounds.minY, v.y);
        bounds.maxX = Math.max(bounds.maxX, v.x);
        bounds.maxY = Math.max(bounds.maxY, v.y);
      });
    }
    if (entity.startPoint) {
      bounds.minX = Math.min(bounds.minX, entity.startPoint.x);
      bounds.minY = Math.min(bounds.minY, entity.startPoint.y);
      bounds.maxX = Math.max(bounds.maxX, entity.startPoint.x);
      bounds.maxY = Math.max(bounds.maxY, entity.startPoint.y);
    }
    if (entity.endPoint) {
      bounds.minX = Math.min(bounds.minX, entity.endPoint.x);
      bounds.minY = Math.min(bounds.minY, entity.endPoint.y);
      bounds.maxX = Math.max(bounds.maxX, entity.endPoint.x);
      bounds.maxY = Math.max(bounds.maxY, entity.endPoint.y);
    }
    if (entity.center) {
      const radius = entity.radius || 0;
      bounds.minX = Math.min(bounds.minX, entity.center.x - radius);
      bounds.minY = Math.min(bounds.minY, entity.center.y - radius);
      bounds.maxX = Math.max(bounds.maxX, entity.center.x + radius);
      bounds.maxY = Math.max(bounds.maxY, entity.center.y + radius);
    }
  };

  const createEntityGeometry = (entity) => {
    const getColor = (colorIndex) => {
      // AutoCAD color index to hex
      const colors = [
        0x000000, 0xFF0000, 0xFFFF00, 0x00FF00, 0x00FFFF,
        0x0000FF, 0xFF00FF, 0xFFFFFF, 0x808080, 0xC0C0C0
      ];
      return colors[colorIndex] || 0x000000;
    };

    const material = new THREE.LineBasicMaterial({
      color: getColor(entity.color !== undefined ? entity.color : 7),
      linewidth: 1
    });

    switch (entity.type) {
      case 'LINE':
        if (entity.startPoint && entity.endPoint) {
          const points = [
            new THREE.Vector3(entity.startPoint.x, entity.startPoint.y, 0),
            new THREE.Vector3(entity.endPoint.x, entity.endPoint.y, 0)
          ];
          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          const line = new THREE.Line(geometry, material);
          line.userData = { entityType: 'LINE', entity };
          return line;
        }
        break;

      case 'LWPOLYLINE':
      case 'POLYLINE':
        if (entity.vertices && entity.vertices.length > 0) {
          const points = entity.vertices.map(v => 
            new THREE.Vector3(v.x, v.y, 0)
          );
          if (entity.shape) points.push(points[0]); // Close if shape
          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          const line = new THREE.Line(geometry, material);
          line.userData = { entityType: 'POLYLINE', entity };
          return line;
        }
        break;

      case 'CIRCLE':
        if (entity.center && entity.radius) {
          const curve = new THREE.EllipseCurve(
            entity.center.x, entity.center.y,
            entity.radius, entity.radius,
            0, 2 * Math.PI,
            false, 0
          );
          const points = curve.getPoints(64);
          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          const line = new THREE.Line(geometry, material);
          line.userData = { entityType: 'CIRCLE', entity };
          return line;
        }
        break;

      case 'ARC':
        if (entity.center && entity.radius) {
          const startAngle = (entity.startAngle || 0) * Math.PI / 180;
          const endAngle = (entity.endAngle || 360) * Math.PI / 180;
          const curve = new THREE.EllipseCurve(
            entity.center.x, entity.center.y,
            entity.radius, entity.radius,
            startAngle, endAngle,
            false, 0
          );
          const points = curve.getPoints(64);
          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          const line = new THREE.Line(geometry, material);
          line.userData = { entityType: 'ARC', entity };
          return line;
        }
        break;

      case 'SPLINE':
        if (entity.controlPoints && entity.controlPoints.length > 1) {
          const points = entity.controlPoints.map(p => 
            new THREE.Vector3(p.x, p.y, 0)
          );
          const curve = new THREE.CatmullRomCurve3(points);
          const curvePoints = curve.getPoints(50);
          const geometry = new THREE.BufferGeometry().setFromPoints(curvePoints);
          const line = new THREE.Line(geometry, material);
          line.userData = { entityType: 'SPLINE', entity };
          return line;
        }
        break;

      default:
        return null;
    }

    return null;
  };

  const handleCanvasClick = (event) => {
    if (!measurementMode) return;

    event.preventDefault();
    
    const rect = rendererRef.current.domElement.getBoundingClientRect();
    let clientX, clientY;
    
    if (event.type === 'touchend' && event.changedTouches) {
      clientX = event.changedTouches[0].clientX;
      clientY = event.changedTouches[0].clientY;
    } else {
      clientX = event.clientX;
      clientY = event.clientY;
    }
    
    mouseRef.current.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    // Convert screen coordinates to world coordinates
    const vector = new THREE.Vector3(mouseRef.current.x, mouseRef.current.y, 0);
    vector.unproject(cameraRef.current);
    
    const point = new THREE.Vector3(vector.x, vector.y, 0);
    measurementPointsRef.current.push(point);

    // Add visual marker
    const markerGeo = new THREE.CircleGeometry(0.05, 16);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.position.copy(point);
    sceneRef.current.add(marker);

    // If we have 2 points, calculate distance
    if (measurementPointsRef.current.length === 2) {
      const p1 = measurementPointsRef.current[0];
      const p2 = measurementPointsRef.current[1];
      const distance = p1.distanceTo(p2);

      // Add line between points
      const lineGeo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
      const lineMat = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 3 });
      const line = new THREE.Line(lineGeo, lineMat);
      sceneRef.current.add(line);

      // Add measurement
      setMeasurements(prev => [...prev, {
        id: Date.now(),
        distance: distance.toFixed(2),
        p1: `(${p1.x.toFixed(2)}, ${p1.y.toFixed(2)})`,
        p2: `(${p2.x.toFixed(2)}, ${p2.y.toFixed(2)})`
      }]);

      measurementPointsRef.current = [];
    }
  };

  const toggleLayer = (layerName) => {
    setLayers(prev => prev.map(layer => 
      layer.name === layerName 
        ? { ...layer, visible: !layer.visible }
        : layer
    ));

    if (layerGroupsRef.current[layerName]) {
      layerGroupsRef.current[layerName].visible = !layerGroupsRef.current[layerName].visible;
    }
  };

  const toggleMeasurementMode = () => {
    setMeasurementMode(!measurementMode);
    if (measurementMode) {
      measurementPointsRef.current = [];
    }
  };

  const clearMeasurements = () => {
    setMeasurements([]);
    measurementPointsRef.current = [];
    
    if (sceneRef.current) {
      const objectsToRemove = [];
      sceneRef.current.traverse((object) => {
        if (object.geometry instanceof THREE.CircleGeometry || 
            (object instanceof THREE.Line && object.material.color.getHex() === 0xff0000)) {
          objectsToRemove.push(object);
        }
      });
      objectsToRemove.forEach(obj => sceneRef.current.remove(obj));
    }
  };

  const takeScreenshot = () => {
    if (!rendererRef.current) return;
    
    try {
      const dataURL = rendererRef.current.domElement.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `${fileName.replace('.dxf', '')}-screenshot.png`;
      link.href = dataURL;
      link.click();
    } catch (err) {
      console.error('Screenshot failed:', err);
      alert('Failed to take screenshot');
    }
  };

  const resetView = () => {
    if (controlsRef.current && cameraRef.current) {
      cameraRef.current.position.set(0, 0, 10);
      cameraRef.current.zoom = 1;
      cameraRef.current.updateProjectionMatrix();
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  };

  const cleanup = () => {
    if (rendererRef.current) {
      rendererRef.current.domElement.removeEventListener('click', handleCanvasClick);
      rendererRef.current.domElement.removeEventListener('touchend', handleCanvasClick);
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    if (sceneRef.current) {
      sceneRef.current.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach(material => material.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
    }

    if (rendererRef.current) {
      rendererRef.current.dispose();
      if (containerRef.current && rendererRef.current.domElement) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
    }

    if (controlsRef.current) {
      controlsRef.current.dispose();
    }
  };

  return (
    <div className="file-viewer-container enhanced">
      <div className="file-viewer-header">
        <div className="viewer-title">
          <span className="viewer-icon">ð</span>
          <div className="title-info">
            <span className="viewer-filename">{fileName}</span>
            {dxfData && (
              <span className="viewer-meta">
                {layers.length} layers â¢ {layers.reduce((sum, l) => sum + l.entityCount, 0)} entities
              </span>
            )}
          </div>
        </div>
        <div className="viewer-actions">
          <button 
            onClick={toggleMeasurementMode} 
            className={`btn btn-sm ${measurementMode ? 'btn-active' : 'btn-secondary'}`}
            title="Measure distance"
          >
            ð {measurementMode ? 'Measuring...' : 'Measure'}
          </button>
          <button onClick={takeScreenshot} className="btn btn-sm btn-secondary" title="Screenshot">
            ð¸
          </button>
          <button onClick={resetView} className="btn btn-sm btn-secondary" title="Reset View">
            ð
          </button>
          <button onClick={onClose} className="btn btn-sm btn-close">
            â
          </button>
        </div>
      </div>

      <div className="file-viewer-body">
        {loading && (
          <div className="viewer-loading">
            <div className="loading-spinner"></div>
            <p>Loading DXF drawing...</p>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }}></div>
            </div>
            <p className="progress-text">{progress}%</p>
          </div>
        )}

        {error && (
          <div className="viewer-error">
            <p>â {error}</p>
            <button onClick={onClose} className="btn btn-primary">
              Close
            </button>
          </div>
        )}

        <div 
          ref={containerRef} 
          className={`viewer-canvas ${measurementMode ? 'measurement-mode' : ''}`}
          style={{ display: loading || error ? 'none' : 'block' }}
        />

        {/* Special Instructions Overlay */}
        {!loading && !error && specialInstructions && showInstructions && (
          <div className="instructions-overlay">
            <div className="instructions-box">
              <button 
                className="instructions-close"
                onClick={() => setShowInstructions(false)}
              >
                â
              </button>
              <h4>â ï¸ Special Instructions:</h4>
              <p>{specialInstructions}</p>
            </div>
          </div>
        )}

        {/* Layers Panel */}
        {layers.length > 1 && (
          <div className="layers-panel">
            <h4>ð Layers</h4>
            <div className="layers-list">
              {layers.map((layer) => (
                <div key={layer.name} className="layer-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={layer.visible}
                      onChange={() => toggleLayer(layer.name)}
                    />
                    <span className="layer-name">{layer.name}</span>
                    <span className="layer-count">({layer.entityCount})</span>
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Measurements Panel */}
        {measurements.length > 0 && (
          <div className="measurements-panel">
            <div className="panel-header">
              <h4>ð Measurements</h4>
              <button onClick={clearMeasurements} className="btn btn-sm btn-secondary">
                Clear All
              </button>
            </div>
            <div className="measurements-list">
              {measurements.map((m) => (
                <div key={m.id} className="measurement-item">
                  <span className="measurement-distance">{m.distance} units</span>
                  <span className="measurement-points">
                    {m.p1} â {m.p2}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="file-viewer-footer">
        <div className="viewer-help">
          <span className="help-item">ð±ï¸ <strong>Pan:</strong> Drag</span>
          <span className="help-item">ð± <strong>Touch:</strong> 1 finger</span>
          <span className="help-item">ð <strong>Zoom:</strong> Scroll/Pinch</span>
          {measurementMode && (
            <span className="help-item help-highlight">
              ð <strong>Click 2 points to measure</strong>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default DxfViewerEnhanced;
