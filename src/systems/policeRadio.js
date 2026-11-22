// Police scanner chatter: when the wanted level rises (or the player shakes the police) a line
// of dispatch radio appears in the subtitles, naming the district and the car.
import { DISTRICTS } from '../data/districts.js';

const RISE = [
  null,
  ['Unit 14, check a disturbance in {district}.', 'Report of a disturbance in {district}. Nearest unit respond.'],
  ['All units, armed suspect in {district}. Proceed with caution.', 'Suspect is fleeing in {district}. Units en route.'],
  ['Suspect in a {car} heading through {district}. Set up roadblocks.', 'Multiple units requested in {district}. Block the main roads.'],
  ['Air One is up. Suspect in {district}, searchlight on.', 'Requesting air support over {district}. Suspect is dangerous.'],
  ['All units, all units: lethal force authorized in {district}.', 'Tactical teams deploying to {district}. Do not let them reach the bridge.'],
];
const LOST = ['Suspect lost. All units resume patrol.', 'We lost them. Units return to your districts.', 'No visual on the suspect. Standing down.'];

export function createPoliceRadio(game) {
  const { events, rng } = game;
  function say(text) {
    if (game.ui.dialogue.active || game.missions.active?.step?.type === 'dialogue') return;
    const district = DISTRICTS[game.district]?.name ?? 'Solara Bay';
    const car = game.player.vehicle ? `${game.player.vehicle.spec.name}` : 'stolen vehicle';
    game.ui.dialogue.say([{ who: 'radio', text: text.replace('{district}', district).replace('{car}', car) }]);
  }
  events.on('wantedChanged', ({ level, before }) => {
    if (level > before && RISE[level]) say(rng.pick(RISE[level]));
  });
  events.on('wantedEscaped', () => say(rng.pick(LOST)));
  events.on('roadblock', () => say('Roadblock in position. Spike the road if you have to.'));
  return {};
}
