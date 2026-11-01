// Shared JSDoc types for `// @ts-check`. This module has no runtime exports.

/**
 * @typedef {object} Spike
 * @property {number} x
 * @property {number} y
 * @property {number} radius
 * @property {number} spin turns per second
 *
 * @typedef {object} Water a rectangle of water filling the open air inside it
 * @property {number} x left edge
 * @property {number} y surface height, the top edge
 * @property {number} width
 * @property {number} depth height of the rectangle below the surface
 *
 * @typedef {object} Trail
 * @property {string} name
 * @property {string} [label]
 * @property {string} [author] who made the trail, credited in the menu and on the results screen
 * @property {string} [description] design notes; not shown during gameplay
 * @property {object[]} terrainBlocks terrain; see terrain-geometry.js. Blocks with `layer: "back"` are back walls: scenery that keeps caves dark and never collides
 * @property {{ x: number, y?: number | null, facing: 1 | -1 }} start
 * @property {{ x: number, y?: number | null }} finish where the finish flower stands, on either side of the start; a null y means on the surface below it
 * @property {{ x: number, y?: number | null }[]} apples
 * @property {{ x: number, y?: number | null }} [nisse] the optional hidden nisse, where its feet stand
 * @property {Array<Partial<Spike>>} [spikes]
 * @property {Array<Partial<Water>>} [water]
 * @property {object[]} [props]
 * @property {string} [terrain] material id
 * @property {{ sun?: number, clouds?: number, fog?: number, rain?: number, snow?: number, lightning?: number, wind?: number, windDirection?: 'left' | 'right' }} [weather]
 * @property {'hills' | 'mountains' | 'forest' | 'desert' | 'city'} [backdrop] parallax background theme; omitted means hills
 * @property {number} [timeOfDay] the hour of the day, 0 (midnight) to 23, for the sky, light and grade; omitted means noon (12)
 * @property {{ gold: number, silver: number, bronze: number }} [medals] target times in seconds
 * @property {Trail} [terrainSource] on a ride's copy of a trail with glass, the trail it copies
 * @property {Map<string, GlassBreak>} [brokenBlocks] on a ride's copy, the panes broken so far, in order
 * @property {Map<string, { strength: number, before: number, until: number }>} [paneStrength] on a ride's copy, the strength each cracked pane has left; `before` is its strength before the landing settling until step `until`
 * @property {GlassCrack[]} [glassCracks] on a ride's copy, every crack so far, in order
 * @property {number} [glassClock] on a ride's copy, the ride's step count
 *
 * @typedef {object} GlassCrack
 * @property {string} blockId
 * @property {number} x where the pane was hit, inside its bounding box
 * @property {number} y
 * @property {number} speed px/s into the pane
 * @property {number} severity the hit as a share of the pane's full strength, 0 … 1
 *
 * @typedef {object} GlassBreak
 * @property {number} x where the pane was hit
 * @property {number} y
 * @property {number} speed px/s into the pane
 * @property {number} left the pane's bounding box
 * @property {number} right
 * @property {number} top
 * @property {number} bottom
 * @property {number[][][]} rings the pane's outline, outer ring first, then holes
 *
 * @typedef {object} Contact
 * @property {number} nx
 * @property {number} ny
 * @property {number} penetration
 * @property {number} [pointX]
 * @property {number} [pointY]
 * @property {number} [slope]
 * @property {boolean} [swept]
 *
 * @typedef {object} Wheel
 * @property {number} x
 * @property {number} y
 * @property {number} ox previous x (Verlet)
 * @property {number} oy previous y (Verlet)
 * @property {number} [px] x at the start of the latest step, for interpolation
 * @property {number} [py]
 * @property {number} inverseMass
 * @property {boolean} grounded
 * @property {Contact | null} contact
 * @property {string} material
 * @property {number} spin
 * @property {number} angularVelocity
 * @property {number} compression  suspension travel in px: positive compressed, negative stretched
 * @property {number} [pcompression] compression at the start of the latest step, for interpolation
 * @property {number} [groundLoad] normal impulse (px/s) the ground gave the wheel this step; tire grip is friction on it
 * @property {number} [pinLoad] part of groundLoad that only answers the push holding a lone grounded wheel under rider lean; it gives no grip
 * @property {number} impactSpeed
 *
 * @typedef {object} Vehicle
 * @property {Wheel} rear
 * @property {Wheel} front
 * @property {{ rearMount: object, frontMount: object, top: object }} chassis
 * @property {object[]} constraints
 * @property {object[]} dampedConstraints
 * @property {object[]} chassisPoints
 * @property {object[]} crashedFrameProbes chassis-point blends on the drawn outline
 * @property {object[][]} frameLinks point pairs joined by the suspension and frame
 * @property {boolean} [framePassThrough] crashed frame ignores terrain while straddling a ledge
 * @property {object[]} bikePoints
 * @property {{ rev: number, clutchTorque?: number }} engine revs in rear-wheel terms, and the torque the clutch passed last step
 *
 * @typedef {object} RideInput
 * @property {number} [facing] 1 or -1; omitted keeps the current facing
 * @property {number} [leanInput] -1 left … 1 right, in screen direction
 * @property {boolean} [accelerating]
 * @property {boolean} [braking]
 *
 * @typedef {{ type: 'start' }
 *   | { type: 'airTurn', full: boolean }
 *   | { type: 'flip', count: number, direction: number }
 *   | { type: 'land', impact: number }
 *   | { type: 'suspension', end: 'bottom' | 'top', wheel: 'rear' | 'front', speed: number }
 *   | { type: 'crash', cause: 'spike' | 'head' | 'fall' | 'water', x: number, y: number }
 *   | { type: 'splash', x: number, y: number, speed: number, rider: boolean }
 *   | { type: 'helmet', x: number, y: number, speed: number }
 *   | { type: 'apple', apple: object, collected: number, total: number, split: number }
 *   | { type: 'nisse', x: number, y: number }
 *   | ({ type: 'shatter', blockId: string } & GlassBreak)
 *   | { type: 'crack', blockId: string, x: number, y: number, speed: number }
 *   | { type: 'goalLocked', missing: number }
 *   | { type: 'win', time: number, x: number, y: number }} RideEvent
 *
 * @typedef {object} Ride
 * @property {Trail} trail the ride's own copy when the trail has glass, so panes can break
 * @property {number} shattered panes already reported as shatter events
 * @property {number} cracked cracks already reported as crack events
 * @property {Wheel} rear
 * @property {Wheel} front
 * @property {Vehicle} vehicle
 * @property {{ x: number, y: number }} flower centre of the finish flower the bike has to touch
 * @property {{ x: number, y: number, taken: boolean }[]} apples
 * @property {{ x: number, y: number, taken: boolean } | null} nisse
 * @property {Spike[]} spikes
 * @property {Water[]} water
 * @property {'running' | 'crashed' | 'won'} status
 * @property {boolean} started whether the timer has started (on first input, or once the bike rolls or drops off its start by itself)
 * @property {number} time simulated seconds since spawn
 * @property {number} elapsed timer seconds
 * @property {number} elapsedSteps steps the timer has run, which `elapsed` is made from
 * @property {number} collected
 * @property {number} facing
 * @property {number} throttle
 * @property {number} brakePressure
 * @property {number} leanControl
 * @property {number} leanVisual -1 back … 1 forward, relative to facing
 * @property {any} ragdoll
 * @property {number[]} splits timer value at each apple pickup
 * @property {number} seed
 * @property {boolean} [helmet]  false for a rider without one; only changes the crash
 * @property {() => number} random
 * @property {number} steps
 * @property {number} spikeTime
 * @property {'spike' | 'head' | 'fall' | 'water' | null} crashCause
 * @property {number} airRotation
 * @property {number} airTurnMilestone
 * @property {number} previousAirAngle
 * @property {boolean} inJump airborne, or touched down but not yet settled
 * @property {number} landingSteps steps a wheel has been down since the jump
 * @property {number} lastGateNotice
 * @property {Record<string, { x: number, y: number, radius: number }> | null} previousRiderContacts
 *
 * @typedef {object} LeaderboardRun
 * @property {number} time
 * @property {string} rider
 * @property {number | null} slot
 * @property {number} [saveId]
 * @property {number} [date]
 */

export {};
