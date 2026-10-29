import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color, DoubleSide, Line as ThreeLine, LineBasicMaterial, Vector3 } from 'three'
import type { MeshStandardMaterial } from 'three'
import { OrbitControls as ThreeOrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Bin, InventoryItem, OptimizedPickStop } from '../../types'
import { getStockStatus } from '../../data/inventoryUtils'
import { useAppStore } from '../../store/useAppStore'
import { warehouseStockColors } from './binStatus'
import { BinDetailModal } from './BinDetailModal'

const binGeometry = new BoxGeometry(0.82, 0.3, 0.94)
const labelTextures = new Map<string, CanvasTexture>()

function labelTexture(text: string): CanvasTexture {
  const cached = labelTextures.get(text)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 80
  const context = canvas.getContext('2d')
  if (!context) return new CanvasTexture(canvas)
  context.fillStyle = '#f8fbfc'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#375568'
  context.font = 'bold 34px Arial'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, canvas.width / 2, canvas.height / 2)
  const texture = new CanvasTexture(canvas)
  labelTextures.set(text, texture)
  return texture
}

function binPosition(bin: Bin): [number, number, number] {
  const aisle = bin.aisle ?? bin.x + 1
  const bay = bin.bay ?? bin.y + 1
  const level = bin.level ?? 1
  const faceOffset = bin.face === 'back' ? 1.05 : -1.05
  const x = (aisle - 3.5) * 3.4 + faceOffset
  const y = 0.75 + (level - 1) * 1.05
  const z = (bay - 3.5) * 1.35
  return [x, y, z]
}

function BinMesh({ bin, item, selected, onSelect }: { bin: Bin; item: InventoryItem; selected: boolean; onSelect: (id: string) => void }) {
  const [x, y, z] = binPosition(bin)
  const status = getStockStatus(item)
  const [initialColor] = useState(() => warehouseStockColors[status])
  const material = useRef<MeshStandardMaterial>(null)
  const targetColor = useRef(new Color(initialColor))
  const startColor = useRef(new Color(initialColor))
  const elapsed = useRef(0)
  const animating = useRef(false)
  useEffect(() => {
    const nextColor = new Color(warehouseStockColors[status])
    targetColor.current.copy(nextColor)
    if (!material.current || material.current.color.equals(nextColor)) {
      animating.current = false
      return
    }
    startColor.current.copy(material.current.color)
    elapsed.current = 0
    animating.current = true
  }, [status])
  useFrame((_, delta) => {
    if (!animating.current || !material.current) return
    elapsed.current = Math.min(0.32, elapsed.current + delta)
    const progress = elapsed.current / 0.32
    const eased = 1 - (1 - progress) ** 3
    material.current.color.copy(startColor.current).lerp(targetColor.current, eased)
    if (progress >= 1) animating.current = false
  })
  return <group position={[x, y, z]}>
    <mesh geometry={binGeometry} castShadow receiveShadow onClick={(event) => { event.stopPropagation(); onSelect(bin.id) }} onPointerOver={(event) => { event.stopPropagation(); document.body.style.cursor = 'pointer' }} onPointerOut={() => { document.body.style.cursor = 'auto' }}>
      <meshStandardMaterial ref={material} color={initialColor} emissive={selected ? '#0d8395' : '#000000'} emissiveIntensity={selected ? 0.18 : 0} roughness={0.65} metalness={0.08} />
    </mesh>
    {selected && <>
      <mesh position={[0, 0.205, 0.478]}>
        <planeGeometry args={[0.54, 0.13]} />
        <meshBasicMaterial map={labelTexture(bin.id)} side={DoubleSide} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0]} scale={[1.13, 1.55, 1.12]}>
        <boxGeometry args={[0.82, 0.3, 0.94]} />
        <meshBasicMaterial color="#0a9db1" wireframe transparent opacity={0.75} />
      </mesh>
    </>}
  </group>
}

function RackStructure() {
  const aisles = useMemo(() => Array.from({ length: 6 }, (_, index) => index + 1), [])
  return <group>
    {aisles.map((aisle) => {
      const center = (aisle - 3.5) * 3.4
      return <group key={aisle}>
        {[-1, 1].map((side) => <group key={side} position={[center + side * 0.96, 0, 0]}>
          {Array.from({ length: 7 }, (_, post) => <mesh key={`post-${post}`} position={[side * 0.6, 2.05, (post - 3) * 1.35]} castShadow>
            <boxGeometry args={[0.12, 4.1, 0.12]} /><meshStandardMaterial color="#577989" metalness={0.62} roughness={0.42} />
          </mesh>)}
          {Array.from({ length: 4 }, (_, level) => <mesh key={`shelf-${level}`} position={[0, 0.47 + level * 1.05, 0]} receiveShadow>
            <boxGeometry args={[1.85, 0.09, 8.15]} /><meshStandardMaterial color="#b8cbd0" metalness={0.22} roughness={0.68} />
          </mesh>)}
          {Array.from({ length: 6 }, (_, bay) => <mesh key={`beam-${bay}`} position={[side * 0.8, 0.62, (bay - 2.5) * 1.35]}>
            <boxGeometry args={[0.05, 0.13, 1.17]} /><meshStandardMaterial color="#477286" metalness={0.5} roughness={0.45} />
          </mesh>)}
        </group>)}
        <mesh position={[center, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.45, 8.4]} /><meshBasicMaterial color="#d8e6e9" transparent opacity={0.42} />
        </mesh>
        <mesh position={[center, 4.7, -4.5]}>
          <planeGeometry args={[0.92, 0.4]} /><meshBasicMaterial map={labelTexture(`AISLE ${String(aisle).padStart(2, '0')}`)} side={DoubleSide} toneMapped={false} />
        </mesh>
      </group>
    })}
  </group>
}

function RouteVisualization({
  polyline,
  stops,
}: {
  polyline: [number, number, number][]
  stops: OptimizedPickStop[]
}) {
  const lineGeometry = useMemo(() => {
    if (polyline.length < 2) return null
    const geom = new BufferGeometry()
    const positions = new Float32Array(polyline.flatMap(([x, , z]) => [x, 0.08, z]))
    geom.setAttribute('position', new BufferAttribute(positions, 3))
    return geom
  }, [polyline])

  const segments = useMemo(() => {
    const segs: { center: [number, number, number]; size: [number, number, number]; key: string }[] = []
    for (let i = 0; i < polyline.length - 1; i++) {
      const p1 = polyline[i]
      const p2 = polyline[i + 1]
      const dx = p2[0] - p1[0]
      const dz = p2[2] - p1[2]
      const len = Math.hypot(dx, dz)
      if (len < 0.01) continue

      const mx = (p1[0] + p2[0]) / 2
      const mz = (p1[2] + p2[2]) / 2

      if (Math.abs(dx) >= Math.abs(dz)) {
        segs.push({
          center: [mx, 0.05, mz],
          size: [len, 0.015, 0.28],
          key: `seg-x-${i}`,
        })
      } else {
        segs.push({
          center: [mx, 0.05, mz],
          size: [0.28, 0.015, len],
          key: `seg-z-${i}`,
        })
      }
    }
    return segs
  }, [polyline])

  const lineObject = useMemo(() => {
    if (!lineGeometry) return null
    return new ThreeLine(lineGeometry, new LineBasicMaterial({ color: '#00e5ff' }))
  }, [lineGeometry])

  return (
    <group>
      {/* Floor corridor tape */}
      {segments.map((seg) => (
        <mesh key={seg.key} position={seg.center}>
          <boxGeometry args={seg.size} />
          <meshStandardMaterial color="#00b4d8" emissive="#00e5ff" emissiveIntensity={0.5} roughness={0.3} />
        </mesh>
      ))}

      {/* Guide line */}
      {lineObject && <primitive object={lineObject} />}

      {/* Depot Marker */}
      <group position={[0, 0.04, -6.5]}>
        <mesh>
          <boxGeometry args={[2.2, 0.06, 1.4]} />
          <meshStandardMaterial color="#10b981" emissive="#059669" emissiveIntensity={0.4} />
        </mesh>
        <mesh position={[0, 0.65, 0]}>
          <planeGeometry args={[1.8, 0.38]} />
          <meshBasicMaterial map={labelTexture('PACKING DEPOT')} side={DoubleSide} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.3, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.6, 8]} />
          <meshStandardMaterial color="#047857" metalness={0.8} />
        </mesh>
      </group>

      {/* Stop Badges & Ground Rings */}
      {stops.map((stop) => {
        const [sx, , sz] = stop.coordinates
        return (
          <group key={`stop-${stop.stopIndex}-${stop.binId}`} position={[sx, 0.04, sz]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
              <ringGeometry args={[0.26, 0.42, 24]} />
              <meshBasicMaterial color="#f59e0b" side={DoubleSide} />
            </mesh>
            <mesh position={[0, 0.45, 0]}>
              <cylinderGeometry args={[0.03, 0.03, 0.9, 8]} />
              <meshStandardMaterial color="#d97706" />
            </mesh>
            <mesh position={[0, 0.95, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.26, 0.26, 0.06, 24]} />
              <meshStandardMaterial color="#f59e0b" emissive="#b45309" emissiveIntensity={0.4} />
            </mesh>
            <mesh position={[0, 0.95, 0.04]}>
              <planeGeometry args={[0.42, 0.2]} />
              <meshBasicMaterial map={labelTexture(`STOP ${stop.stopIndex}`)} side={DoubleSide} toneMapped={false} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

function SceneContents({
  bins,
  stock,
  selectedBinId,
  onSelect,
  routePolyline,
  routeStops,
}: {
  bins: Bin[]
  stock: InventoryItem[]
  selectedBinId: string
  onSelect: (id: string) => void
  routePolyline?: [number, number, number][]
  routeStops?: OptimizedPickStop[]
}) {
  const inventoryByBin = useMemo(() => new Map(stock.map((entry) => [entry.binId, entry])), [stock])
  return <>
    <color attach="background" args={['#f5f8f9']} />
    <ambientLight intensity={1.35} />
    <directionalLight position={[10, 18, 12]} intensity={2.4} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
    <hemisphereLight args={['#ffffff', '#c5d5d8', 0.75]} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]} receiveShadow>
      <planeGeometry args={[25.2, 10.2]} /><meshStandardMaterial color="#e8f0f2" roughness={0.9} />
    </mesh>
    <gridHelper args={[25, 50, '#b9cbd0', '#d5e0e3']} position={[0, -0.045, 0]} />
    <RackStructure />
    {routePolyline && routePolyline.length > 0 && (
      <RouteVisualization polyline={routePolyline} stops={routeStops || []} />
    )}
    {bins.map((bin) => {
      const liveItem = inventoryByBin.get(bin.id)
      const item: InventoryItem = (liveItem && !liveItem.archived) ? liveItem : {
        skuId: bin.skuId || 'EMPTY',
        binId: bin.id,
        quantity: 0,
        reserved: 0,
        updated: '',
        capacity: bin.capacity,
        reorderPoint: 0,
        available: true,
      }
      return <BinMesh key={bin.id} bin={bin} item={item} selected={selectedBinId === bin.id} onSelect={onSelect} />
    })}
  </>
}

function CameraControls({ resetVersion, zoomVersion, focusVersion, focusBin }: { resetVersion: number; zoomVersion: number; focusVersion: number; focusBin: Bin | undefined }) {
  const { camera, gl } = useThree()
  const controls = useRef<ThreeOrbitControls | null>(null)
  const lastResetVersion = useRef(resetVersion)
  const lastZoomVersion = useRef(zoomVersion)
  useEffect(() => {
    const orbit = new ThreeOrbitControls(camera, gl.domElement)
    orbit.enableDamping = true
    orbit.dampingFactor = 0.08
    orbit.minDistance = 9
    orbit.maxDistance = 38
    orbit.maxPolarAngle = Math.PI / 2.08
    orbit.target.set(0, 0.7, 0)
    orbit.update()
    controls.current = orbit
    return () => { orbit.dispose(); controls.current = null }
  }, [camera, gl])
  useEffect(() => {
    const orbit = controls.current
    if (!orbit) return
    if (lastResetVersion.current !== resetVersion) {
      camera.position.set(21, 18, 24)
      orbit.target.set(0, 0.7, 0)
      lastResetVersion.current = resetVersion
    } else if (focusBin) {
      const [x, y, z] = binPosition(focusBin)
      const next = new Vector3(x, y, z)
      const offset = camera.position.clone().sub(orbit.target).normalize().multiplyScalar(17)
      orbit.target.copy(next)
      camera.position.copy(next.clone().add(offset))
    }
    orbit.update()
  }, [camera, focusBin, focusVersion, resetVersion])
  useEffect(() => {
    const orbit = controls.current
    if (!orbit || lastZoomVersion.current === zoomVersion) return
    if (zoomVersion > lastZoomVersion.current) orbit.dollyIn(1.22)
    else orbit.dollyOut(1.22)
    lastZoomVersion.current = zoomVersion
    orbit.update()
  }, [zoomVersion])
  useFrame(() => controls.current?.update())
  return null
}

export function WarehouseScene({
  bins,
  inventory,
  selectedBinId,
  onSelect,
  resetVersion,
  zoomVersion,
  focusVersion,
  focusBin,
  routePolyline,
  routeStops,
  showRoute = true,
}: {
  bins: Bin[]
  inventory: InventoryItem[]
  selectedBinId: string
  onSelect: (id: string) => void
  resetVersion: number
  zoomVersion: number
  focusVersion: number
  focusBin?: Bin
  routePolyline?: [number, number, number][]
  routeStops?: OptimizedPickStop[]
  showRoute?: boolean
}) {
  const [modalBinId, setModalBinId] = useState<string | null>(null)
  const storeRoute = useAppStore((state) => state.activeRoutePreview)
  const activePolyline = routePolyline ?? (showRoute ? storeRoute?.fullRouteCoordinates : undefined)
  const activeStops = routeStops ?? (showRoute ? storeRoute?.stops : undefined)

  function handleSelect(id: string) {
    onSelect(id)
    setModalBinId(id)
  }

  return (
    <div className="warehouse-scene-wrapper" style={{ position: 'relative', width: '100%', height: '100%', minHeight: '380px' }}>
      <Canvas
        fallback={
          <div className="scene-error">
            3D rendering is unavailable in this browser. Inventory inspection is still available in the bin inspector.
          </div>
        }
        shadows
        dpr={[1, 1.6]}
        camera={{ position: [21, 18, 24], fov: 43, near: 0.1, far: 120 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <CameraControls resetVersion={resetVersion} zoomVersion={zoomVersion} focusVersion={focusVersion} focusBin={focusBin} />
        <SceneContents
          bins={bins}
          stock={inventory}
          selectedBinId={selectedBinId}
          onSelect={handleSelect}
          routePolyline={activePolyline}
          routeStops={activeStops}
        />
      </Canvas>

      {modalBinId && (
        <BinDetailModal
          binId={modalBinId}
          onClose={() => setModalBinId(null)}
        />
      )}
    </div>
  )
}
