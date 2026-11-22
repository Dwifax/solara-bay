// Side activities: the street race circuits run from Ocean Drive, and where the 24 Golden Shells
// are hidden around the city.

export const RACE_GRID = { x: -300, z: 305.2, heading: Math.PI / 2 };

export const STREET_RACES = [
  {
    id: 'coastline',
    title: 'Coastline Sprint',
    reward: { money: 1800, respect: 160 },
    checkpoints: [[-100, 300], [100, 300], [300, 300], [300, 100], [300, -100], [500, -100], [500, 100], [500, 200], [300, 200], [100, 200]],
  },
  {
    id: 'meridian',
    title: 'Meridian Loop',
    reward: { money: 1500, respect: 140 },
    checkpoints: [[-100, 300], [-100, 100], [-100, -200], [100, -200], [100, 0], [100, 200], [-200, 200]],
  },
  {
    id: 'palmetto',
    title: 'Palmetto Dash',
    reward: { money: 1300, respect: 120 },
    checkpoints: [[-100, 300], [-100, 100], [-400, 100], [-400, -300], [-200, -300], [-200, 0], [-300, 100]],
  },
];

export const RACE_RIVALS = [
  { car: 'vento', color: 0x00b4d8, x: -300, z: 301.6, skill: 0.95 },
  { car: 'brawler', color: 0x111111, x: -312, z: 305.2, skill: 0.9 },
  { car: 'marlin', color: 0xecf0f1, x: -312, z: 301.6, skill: 0.85 },
];

export const GOLDEN_SHELLS = [
  [-480, 340], [-300, 355], [-60, 345], [220, 350], [330, 330], [-148, 455], [-35, 135], [-262, -338],
  [680, -300], [640, 240], [455, -340], [620, 0], [-9, -290], [330, -420], [330, 60], [-450, -491],
  [-520, -150], [191, 50], [291, -350], [-350, 209], [400, -108.5], [660, 254], [-391, -50], [91, -150],
];

export const SHELL_REWARD = { money: 250, respect: 40, allBonus: 10000 };
