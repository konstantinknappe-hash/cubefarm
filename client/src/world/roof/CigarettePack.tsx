import { t } from '../../i18n';
import { useInteractable } from '../interact';
import { GRILL, MANAGER_DESK } from '../layout';
import * as THREE from 'three';

export function CigarettePack({
  location = 'roof',
}: {
  location?: 'roof' | 'manager';
}) {
  const manager = location === 'manager';
  const ref = useInteractable<THREE.Group>({
    id: manager ? 'cigarette-pack-manager' : 'cigarette-pack',
    label: t('world.roof.cigarette'),
    action: { kind: 'pickup', toyId: manager ? 'cigarette-pack-manager' : 'cigarette-pack' },
  }, 3);

  return (
    <group
      ref={ref}
      position={manager ? [MANAGER_DESK.x - 0.62, 0.812, MANAGER_DESK.z + 0.31] : [GRILL.x + 0.85, 0.83, GRILL.z]}
      rotation={[-Math.PI / 2, 0, 0.2]}
      scale={manager ? 1.3 : 1}
    >
      <mesh>
        <boxGeometry args={[0.055, 0.085, 0.022]} />
        <meshStandardMaterial color="#bd202c" />
      </mesh>
      <mesh position={[0, 0.022, 0.0115]}>
        <boxGeometry args={[0.054, 0.040, 0.002]} />
        <meshStandardMaterial color="#f7f5ee" />
      </mesh>
      <mesh position={[0, 0.005, 0.013]}>
        <boxGeometry args={[0.038, 0.004, 0.002]} />
        <meshStandardMaterial color="#bb2430" />
      </mesh>
    </group>
  );
}
