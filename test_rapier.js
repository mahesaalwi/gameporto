import RAPIER from '@dimforge/rapier3d-compat';

async function run() {
  await RAPIER.init();
  const world = new RAPIER.World(new RAPIER.Vector3(0, -9.81, 0));
  
  const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, -10, 0);
  const body = world.createRigidBody(bodyDesc);
  const colliderDesc = RAPIER.ColliderDesc.cuboid(500, 10, 500);
  world.createCollider(colliderDesc, body);
  
  // world.step(); // Is this needed?
  const ray = new RAPIER.Ray({ x: 0, y: 100, z: 0 }, { x: 0, y: -1, z: 0 });
  let hit = world.castRay(ray, 200, true);
  console.log("Without step:", hit ? hit.timeOfImpact : null);
  
  world.step();
  hit = world.castRay(ray, 200, true);
  console.log("With step:", hit ? hit.timeOfImpact : null);
}
run();
