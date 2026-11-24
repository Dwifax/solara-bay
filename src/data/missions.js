// The story of Solara Bay in nine missions. Each mission is a list of steps the mission system
// runs in order: dialogue, driving somewhere, stealing or delivering a vehicle, picking someone
// up, racing, chasing, fighting, escorting, holding a position, collecting and escaping.

const PI = Math.PI;

export const MISSIONS = [
  {
    id: 'homecoming',
    title: 'Homecoming',
    giver: 'kiko',
    letter: 'K',
    start: { x: -138, z: 92 },
    reward: { money: 800, streetCred: 150 },
    steps: [
      { type: 'dialogue', lines: [
        { who: 'kiko', text: "Sol? It's Kiko. You're really back in Solara Bay?" },
        { who: 'sol', text: 'Landed this morning. You said it was bad. How bad?' },
        { who: 'kiko', text: "The Gulls are circling the Sunset Pier. I'm hiding by the arcade. Come get me. Please." },
      ] },
      { type: 'enterVehicle', spawn: { car: 'heron', color: 0x2a9d8f, x: -128, z: 105.2, heading: PI / 2, tag: 'ride' }, text: 'Get in the ~Heron~ parked outside.' },
      { type: 'pickup', ped: { id: 'kiko', x: -148, z: 314, outfit: { skin: 0xc68a5e, hair: 0x1c1410, shirt: 0x3e92cc, pants: 0x3d3d3d, cap: 0xffc857 } }, radius: 13, text: 'Pick up ~Kiko~ at the Sunset Pier.' },
      { type: 'dialogue', lines: [
        { who: 'kiko', text: "Drive. Just drive. They took my phone and my bike." },
        { who: 'sol', text: 'How much do you owe them, Kiko?' },
        { who: 'kiko', text: 'Twenty grand. It was eight. Gull calls the rest "interest."' },
        { who: 'sol', text: "We'll go see Tío Benny. He'll know how to talk to dock people." },
      ] },
      { type: 'goto', x: 550, z: -96, radius: 9, vehicle: true, text: "Drive Kiko to ~Benny's Bait & Tackle~ at the docks." },
      { type: 'dropoff' },
      { type: 'dialogue', lines: [
        { who: 'benny', text: 'Mija! Four years and not one postcard. Get in here.' },
        { who: 'benny', text: 'Gull is not a talker. But he respects money and nerve. You still drive like a hurricane?' },
        { who: 'sol', text: 'Worse.' },
        { who: 'benny', text: 'Good. Go see Juno Park on Halcyon Strand. Win her race and the whole beach knows your name again.' },
      ] },
    ],
  },
  {
    id: 'wheelwoman',
    title: 'Wheel Woman',
    giver: 'juno',
    letter: 'J',
    start: { x: -300, z: 291 },
    reward: { money: 1500, streetCred: 250 },
    steps: [
      { type: 'dialogue', lines: [
        { who: 'juno', text: "Well, well. Sol Navarro. Heard you retired to somewhere with snow." },
        { who: 'sol', text: 'Heard you never beat my lap record.' },
        { who: 'juno', text: "Halcyon Strand, up through Little Coral, back down to the beach. Loser buys the tacos. Take the Brawler." },
      ] },
      { type: 'enterVehicle', spawn: { car: 'brawler', color: 0xd62828, x: -330, z: 305.2, heading: PI / 2, tag: 'racer' }, text: 'Get in the ~Brawler~ on the start line.' },
      { type: 'race', countdown: 3, rivals: [
        { car: 'vireo', color: 0xff9cf2, x: -330, z: 301.6, skill: 1.0, name: 'Juno' },
        { car: 'heron', color: 0x1f3a93, x: -342, z: 305.2, skill: 0.85 },
        { car: 'pip', color: 0xf9c74f, x: -342, z: 301.6, skill: 0.8 },
      ], checkpoints: [[-100, 300], [100, 300], [100, 100], [100, 0], [-100, 0], [-300, 0], [-300, 200], [-200, 300]], text: 'Win the race. Pass through the ~checkpoints~.' },
      { type: 'dialogue', lines: [
        { who: 'juno', text: 'Okay, okay. You still have it. Tacos are on me.' },
        { who: 'juno', text: "And Sol? Gull's people were watching. You just put yourself on his radar." },
      ] },
    ],
  },
  {
    id: 'coldcargo',
    title: 'Cold Cargo',
    giver: 'benny',
    letter: 'B',
    start: { x: 550, z: -92 },
    reward: { money: 2500, streetCred: 350 },
    steps: [
      { type: 'dialogue', lines: [
        { who: 'benny', text: 'The Gulls move their cash in a reefer truck. Under the frozen fish. Every Thursday.' },
        { who: 'benny', text: "It's sitting in their yard right now, north end of the port. Take it to Sunset Customs. My guy will strip it." },
        { who: 'sol', text: "That's stealing from the people Kiko owes." },
        { who: 'benny', text: "That's paying them with their own money. Very efficient. Don't let the cops follow you in." },
      ] },
      { type: 'goto', x: 590, z: 40, radius: 22, text: "Go to the Gulls' yard at the ~docks~.",
        enemies: [
          { id: 'yard', role: 'gang', weapon: 'pistol', x: 589.5, z: 34, hostile: false },
          { id: 'yard', role: 'gang', weapon: 'pistol', x: 589.5, z: 66, hostile: false },
          { id: 'yard', role: 'gang', weapon: 'smg', x: 610, z: 62, hostile: false },
        ] },
      { type: 'enterVehicle', spawn: { car: 'reefer', x: 595, z: 50, heading: 0, tag: 'reefer' }, text: 'Steal the ~reefer truck~.', onComplete: { hostile: 'yard', wanted: 2, say: [{ who: 'gull', text: '(on the yard speaker) Hey! HEY! That is GULL property!' }] } },
      { type: 'deliver', tag: 'reefer', x: 50, z: 104, radius: 9, requireNoWanted: true, text: 'Take the reefer to ~Sunset Customs~.', wantedText: 'Lose the ~cops~ before you go to the garage.' },
      { type: 'dialogue', lines: [
        { who: 'benny', text: "(phone) My guy says the freezer had more ice than cash, but it's a start. Ten grand off Kiko's tab." },
        { who: 'benny', text: 'Dez wants to see you. Kiko\'s roommate. Smart kid, terrible haircut.' },
      ] },
    ],
  },
  {
    id: 'papertrail',
    title: 'Paper Trail',
    giver: 'dez',
    letter: 'D',
    start: { x: 108, z: -50 },
    reward: { money: 2000, streetCred: 300 },
    steps: [
      { type: 'dialogue', lines: [
        { who: 'dez', text: "Sol! Kiko talks about you like you're a superhero. I made you a playlist." },
        { who: 'dez', text: "Business: every evening a Gull courier drives the paper ledger across town. Who pays Gull, and who pays him." },
        { who: 'dez', text: "The courier just left Riverside. Stop that car, grab the ledger. I'll do the reading." },
      ] },
      { type: 'getVehicle', text: 'Get a ~car~.' },
      { type: 'chase', target: { car: 'heron', color: 0x111111, x: 205, z: -98.1, heading: PI / 2, cruise: 21, tag: 'courier' }, mode: 'disable', loseDistance: 260, text: 'Ram the ~courier~ until the car stops.' },
      { type: 'collect', at: 'courier', item: 'ledger', text: 'Grab the ~ledger~.' },
      { type: 'goto', x: 108, z: -50, radius: 6, text: 'Bring the ledger to ~Dez~.' },
      { type: 'dialogue', lines: [
        { who: 'dez', text: 'Shipping fees, protection, okay, okay... wait. Castellane Holdings. Monthly. Big numbers.' },
        { who: 'sol', text: 'Vera Castellane? The tower lady from the billboards?' },
        { who: 'dez', text: "She's paying the Gulls to scare dock owners into selling. And look who signs for the cash. Captain Hollis Ward." },
      ] },
    ],
  },
  {
    id: 'gullseason',
    title: 'Gull Season',
    giver: 'benny',
    letter: 'B',
    start: { x: 550, z: -92 },
    reward: { money: 4000, streetCred: 500 },
    quiet: true,
    steps: [
      { type: 'dialogue', lines: [
        { who: 'benny', text: 'Gull found out about the truck. He burned the Ortiz boathouse tonight. Sent a message.' },
        { who: 'sol', text: 'Then I send one back.' },
        { who: 'benny', text: "His crew sits in the warehouse south of here. Take a gun from the drawer. And Sol... come back." },
      ], onComplete: { giveWeapon: ['smg', 120] } },
      { type: 'goto', x: 560, z: -196, radius: 22, text: "Go to the Gulls' ~warehouse~.",
        enemies: [
          { id: 'wave1', role: 'gang', weapon: 'pistol', x: 535, z: -203, hostile: true },
          { id: 'wave1', role: 'gang', weapon: 'smg', x: 560, z: -206, hostile: true },
          { id: 'wave1', role: 'gang', weapon: 'pistol', x: 585, z: -203, hostile: true },
          { id: 'wave1', role: 'gang', weapon: 'pistol', x: 602, z: -170, hostile: true },
          { id: 'wave1', role: 'gang', weapon: 'shotgun', x: 603, z: -140, hostile: true },
        ] },
      { type: 'kill', group: 'wave1', text: 'Take out the ~Gulls~.' },
      { type: 'kill', group: 'wave2', text: 'More Gulls! Take them ~down~.', spawnOnStart: [
        { id: 'wave2', role: 'gang', weapon: 'smg', x: 603, z: -262, hostile: true },
        { id: 'wave2', role: 'gang', weapon: 'shotgun', x: 597, z: -250, hostile: true, health: 160 },
        { id: 'wave2', role: 'gang', weapon: 'pistol', x: 560, z: -296, hostile: true },
        { id: 'wave2', role: 'gang', weapon: 'smg', x: 530, z: -297, hostile: true },
      ], say: [{ who: 'gull', text: "You think you can walk into MY port? Light her up!" }] },
      { type: 'collect', x: 600, z: -236, item: 'cash', text: "Grab Gull's ~cash bag~." },
      { type: 'dialogue', lines: [
        { who: 'sol', text: '(phone) Benny. Gull ran. His crew is done.' },
        { who: 'benny', text: "Then the docks breathe tonight. But Gull's money came from somewhere higher up." },
      ] },
    ],
  },
  {
    id: 'sunsetescort',
    title: 'Sunset Escort',
    giver: 'dez',
    letter: 'D',
    start: { x: 108, z: -50 },
    reward: { money: 3000, streetCred: 450 },
    quiet: true,
    steps: [
      { type: 'dialogue', lines: [
        { who: 'dez', text: "I copied Vera's accounting servers through a smart fridge. Don't ask. Now I need them somewhere safe." },
        { who: 'dez', text: "My cousin has a villa up in Vista Hills. I drive the van, you keep the Gulls off me. Deal?" },
      ] },
      { type: 'getVehicle', text: 'Get a ~car~ to follow Dez.' },
      { type: 'escort', vehicle: { car: 'surfline', color: 0xf1f1f1, x: 101.9, z: -62, heading: PI, tag: 'dezvan' }, from: '1,-1', to: '-2,-5', ambushes: [0.35, 0.72], text: 'Follow and protect ~Dez~\'s van.' },
      { type: 'dialogue', lines: [
        { who: 'dez', text: "Servers are safe. And I found the jackpot: a vault in Castellane Tower. Paper records. She doesn't trust clouds." },
        { who: 'sol', text: "Then we go get the paper." },
      ] },
    ],
  },
  {
    id: 'glasshouse',
    title: 'Glass House',
    giver: 'benny',
    letter: 'B',
    start: { x: 550, z: -92 },
    reward: { money: 15000, streetCred: 900 },
    quiet: true,
    steps: [
      { type: 'dialogue', lines: [
        { who: 'benny', text: 'Castellane Tower. Forty floors of glass and one vault in the lobby level.' },
        { who: 'dez', text: '(phone) I loop the cameras, you stand at the lobby doors while my drill does the work. Sixty seconds, give or take.' },
        { who: 'benny', text: "The moment that alarm sings, every cop in Meridian comes running. Have a way out." },
      ] },
      { type: 'goto', x: -50, z: -211, radius: 6, text: 'Go to the ~Castellane Tower~ lobby.' },
      { type: 'hold', x: -50, z: -211, radius: 9, time: 45, text: 'Hold the lobby while Dez cracks the ~vault~.', wanted: 3,
        enemies: [
          { id: 'guards', role: 'guard', weapon: 'pistol', x: -82, z: -208, hostile: true },
          { id: 'guards', role: 'guard', weapon: 'smg', x: -18, z: -208, hostile: true },
          { id: 'guards', role: 'guard', weapon: 'pistol', x: -90, z: -230, hostile: true },
          { id: 'guards', role: 'guard', weapon: 'shotgun', x: -10, z: -230, hostile: true },
        ], say: [{ who: 'radio', text: 'All units, alarm at Castellane Tower, Meridian. Armed suspect at the lobby.' }] },
      { type: 'collect', x: -50, z: -212, item: 'drive', text: 'Grab the ~evidence~ from the vault.' },
      { type: 'loseWanted', text: 'Lose the ~cops~.' },
      { type: 'goto', x: -150, z: 94, radius: 6, text: "Get back to ~Sol's Place~." },
      { type: 'dialogue', lines: [
        { who: 'dez', text: "Bank transfers, deeds, Ward's signature on everything. This is the whole machine." },
        { who: 'sol', text: "And a cash cut. Kiko's debt is paid. Twice." },
      ] },
    ],
  },
  {
    id: 'badgebones',
    title: 'Badge & Bones',
    giver: 'benny',
    letter: 'B',
    start: { x: 550, z: -92 },
    reward: { money: 5000, streetCred: 700 },
    steps: [
      { type: 'dialogue', lines: [
        { who: 'ward', text: '(phone) Miss Navarro. Captain Ward. You have something of Mrs. Castellane\'s. Let\'s be adults.' },
        { who: 'ward', text: 'Middle of the Solara Bay Bridge. Ten minutes. Come alone and we all go home.' },
        { who: 'benny', text: "It's a trap, mija. It's always a trap." },
        { who: 'sol', text: "I know. That's why I'm driving." },
      ] },
      { type: 'getVehicle', text: 'Get a ~car~.' },
      { type: 'goto', x: 400, z: -100, radius: 10, vehicle: true, text: 'Drive to the middle of the ~Solara Bay Bridge~.' },
      { type: 'dialogue', lines: [
        { who: 'ward', text: '(radio) All units, the suspect is on the bridge. Lethal force authorized.' },
        { who: 'sol', text: 'Of course.' },
      ], onComplete: { wanted: 4 } },
      { type: 'loseWanted', text: 'Escape the ~police~.' },
      { type: 'goto', x: 630, z: 228, radius: 9, text: "Hide out at the ~lighthouse quay~." },
      { type: 'dialogue', lines: [
        { who: 'benny', text: "(phone) You're alive. Good. Dez sent the files to every newsroom in the state." },
        { who: 'benny', text: "Vera is running. Her yacht is waiting at the Sunset Pier. Kiko wants to finish this with you." },
      ] },
    ],
  },
  {
    id: 'lastlight',
    title: 'Last Light',
    giver: 'kiko',
    letter: 'K',
    start: { x: -138, z: 92 },
    reward: { money: 25000, streetCred: 1500 },
    quiet: true,
    steps: [
      { type: 'dialogue', lines: [
        { who: 'kiko', text: "Vera's leaving the tower right now. Black Vireo, bodyguards behind her." },
        { who: 'sol', text: "Stay here, Kiko. I mean it." },
        { who: 'kiko', text: "I owe you one sister-sized favour. Go." },
      ] },
      { type: 'getVehicle', text: 'Get a ~car~.' },
      { type: 'chase', target: { car: 'vireo', color: 0x0b0b0b, x: -70, z: -201.9, heading: -PI / 2, cruise: 23, tag: 'vera' }, mode: 'disable', loseDistance: 280, hunters: 2, text: "Stop ~Vera's~ car." },
      { type: 'dialogue', lines: [
        { who: 'vera', text: "(over the speaker) You're a driver, Miss Navarro. I build cities. Walk away." },
        { who: 'sol', text: 'You burn them down too.' },
      ] },
      { type: 'goto', x: -148, z: 395, radius: 14, text: "Vera ran for her yacht. Get to the ~pier~." ,
        enemies: [
          { id: 'pier', role: 'guard', weapon: 'smg', x: -144, z: 425, hostile: true },
          { id: 'pier', role: 'guard', weapon: 'pistol', x: -152, z: 432, hostile: true },
          { id: 'pier', role: 'guard', weapon: 'shotgun', x: -146, z: 445, hostile: true, health: 150 },
          { id: 'pier', role: 'guard', weapon: 'rifle', x: -151, z: 455, hostile: true },
          { id: 'pier', role: 'guard', weapon: 'pistol', x: -140, z: 410, hostile: true },
        ] },
      { type: 'kill', group: 'pier', text: "Take out Vera's ~bodyguards~." },
      { type: 'dialogue', lines: [
        { who: 'vera', text: "Fine. FINE. Take the deeds. The docks, the pier, all of it. It's just paper." },
        { who: 'sol', text: 'So is a confession. Captain Ward already signed his.' },
        { who: 'kiko', text: '(phone) Sol! The news says Ward got picked up at the airport. Is it over?' },
        { who: 'sol', text: "It's over, Kiko. Tell Benny to fire up the grill. I'm home." },
      ] },
    ],
  },
];

