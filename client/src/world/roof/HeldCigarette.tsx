import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store';
import { FIRST_PERSON } from '../viewTags';

export function HeldCigarette() {
  const cigarette = useStore((s) =>
    s.held?.kind === 'cigarette' ? s.held : null
  );

  const root = useRef<THREE.Group>(null);
  const stick = useRef<THREE.Group>(null);
  const smoke = useRef<THREE.Group>(null);

  useFrame(({ camera }) => {
    const r = root.current;
    const c = stick.current;
    if (!r || !c || !cigarette) return;

    r.position.copy(camera.position);
    r.quaternion.copy(camera.quaternion);

    const now = performance.now();
    const age = cigarette.puffAt > 0
      ? now - cigarette.puffAt
      : Infinity;

    const drawing = cigarette.lit && age < 2500;
    const lift = drawing
      ? Math.sin(Math.PI * Math.min(1, age / 2500))
      : 0;

    c.position.set(
      0.19 - 0.15 * lift,
      -0.16 + 0.10 * lift + Math.sin(now / 550) * 0.002,
      -0.43 + 0.18 * lift,
    );
    c.rotation.set(-0.2, 0.25, -0.12);

    if (smoke.current) {
      const visible = cigarette.lit && age < 3500;
      smoke.current.visible = visible;

      if (visible) {
        smoke.current.children.forEach((child, i) => {
          const puff = child as THREE.Mesh;
          const progress = Math.min(
            1,
            Math.max(0, age / 3500 - i * 0.12)
          );

          puff.position.set(
            Math.sin(progress * 5 + i) * 0.018,
            progress * 0.20,
            -0.16 - progress * 0.03,
          );
          puff.scale.setScalar(0.5 + progress * 1.5);

          const material = puff.material as THREE.MeshBasicMaterial;
          material.opacity = Math.max(0, 0.28 * (1 - progress));
        });
      }
    }
  });

  if (!cigarette) return null;

  const remaining = Math.max(0.15, cigarette.puffs / 6);
  const paperLength = 0.09 * remaining;

  return (
    <group ref={root} userData={FIRST_PERSON}>
      <group ref={stick}>
        {/* Brown filter */}
        <mesh position={[0, 0, -0.025]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.011, 0.011, 0.05, 10]} />
          <meshStandardMaterial color="#bd8c55" />
        </mesh>

        {/* White paper */}
        <mesh position={[0, 0, -0.05 - paperLength / 2]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.011, 0.011, paperLength, 10]} />
          <meshStandardMaterial color="#f4f0e7" />
        </mesh>

        {/* Burning tip */}
        {cigarette.lit && (
          <mesh position={[0, 0, -0.05 - paperLength]}>
            <sphereGeometry args={[0.012, 10, 8]} />
            <meshStandardMaterial
              color="#ff7136"
              emissive="#ff3000"
              emissiveIntensity={1.6}
            />
          </mesh>
        )}

        <group ref={smoke}>
          {Array.from({ length: 5 }, (_, i) => (
            <mesh key={i}>
              <sphereGeometry args={[0.022, 8, 6]} />
              <meshBasicMaterial
                color="#d8d8d8"
                transparent
                opacity={0}
                depthWrite={false}
              />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}
