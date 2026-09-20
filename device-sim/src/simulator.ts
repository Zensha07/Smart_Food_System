type PistonState =
  | "IDLE"
  | "DISPENSING"
  | "RETRACTING"
  | "FAULT";

let state: PistonState = "IDLE";
let position = 0;

function printState() {
  console.log(
    `State: ${state} | Position: ${position}%`
  );
}

function startDispensing() {
  if (state !== "IDLE") {
    console.log(`Cannot dispense. Current state: ${state}`);
    return;
  }

  console.log("Starting piston...");

  state = "DISPENSING";

  const interval = setInterval(() => {
    position += 10;

    if (position >= 100) {
      position = 100;
      clearInterval(interval);

      state = "IDLE";

      console.log("Dispensing complete.");
      printState();

      return;
    }

    printState();
  }, 500);
}

function retractPiston() {
  if (state !== "IDLE") {
    console.log(`Cannot retract. Current state: ${state}`);
    return;
  }

  console.log("Retracting piston...");

  state = "RETRACTING";

  const interval = setInterval(() => {
    position -= 10;

    if (position <= 0) {
      position = 0;
      clearInterval(interval);

      state = "IDLE";

      console.log("Retraction complete.");
      printState();

      return;
    }

    printState();
  }, 500);
}

console.log("SmartFoodSystem Device Simulator");
console.log("--------------------------------");

printState();

setTimeout(() => {
  startDispensing();

  setTimeout(() => {
    retractPiston();
  }, 6000);
}, 1000);