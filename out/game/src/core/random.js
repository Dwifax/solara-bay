export function seededRandom(seed) {
  return function() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

export function chooseRandom(arr, random) {
  return arr[Math.floor(random() * arr.length)];
}

export function randomInRange(min, max, random) {
  return min + random() * (max - min);
}

export function randomInt(min, max, random) {
  return Math.floor(randomInRange(min, max + 1, random));
}
