import mqtt from "mqtt";

type PistonState =
  | "IDLE"
  | "DISPENSING"
  | "RETRACTING"
  | "FAULT";

let state: PistonState = "IDLE";
let position = 0;
let activeInterval: ReturnType<typeof setInterval> | null = null;

const DEVICE_ID = "device-001";
const MQTT_BROKER = "mqtt://localhost:1883";

const commandTopic = `smartfood/${DEVICE_ID}/command`;
const stateTopic = `smartfood/${DEVICE_ID}/state`;

const mqttClient = mqtt.connect(MQTT_BROKER);

function printState() {
  console.log(
    `State: ${state} | Position: ${position}%`
  );
}

function publishState() {
  mqttClient.publish(
    stateTopic,
    JSON.stringify({
      deviceId: DEVICE_ID,
      state,
      position,
    })
  );
}

function startDispensing() {
  if (state !== "IDLE") {
    console.log(`Cannot dispense. Current state: ${state}`);
    return;
  }

  console.log("Starting piston...");

  state = "DISPENSING";
  publishState();

  activeInterval = setInterval(() => {
    position += 10;

    if (position >= 100) {
      position = 100;
      clearInterval(activeInterval!);
      activeInterval = null;

      state = "IDLE";

      console.log("Dispensing complete.");
      printState();
      publishState();

      return;
    }

    printState();
    publishState();
  }, 500);
}

function retractPiston() {
  if (state !== "IDLE") {
    console.log(`Cannot retract. Current state: ${state}`);
    return;
  }

  console.log("Retracting piston...");

  state = "RETRACTING";
  publishState();

  activeInterval = setInterval(() => {
    position -= 10;

    if (position <= 0) {
      position = 0;
      clearInterval(activeInterval!);
      activeInterval = null; 

      state = "IDLE";

      console.log("Retraction complete.");
      printState();
      publishState();

      return;
    }

    printState();
    publishState();
  }, 500);
}

function stopPiston() {
  if (activeInterval !== null) {
    clearInterval(activeInterval);
    activeInterval = null;
  }

  if (state === "DISPENSING" || state === "RETRACTING") {
    state = "IDLE";

    console.log("Piston stopped.");
    printState();
    publishState();
  } else {
    console.log(`Cannot stop. Current state: ${state}`);
  }
}

mqttClient.on("connect", () => {
  console.log("Connected to MQTT broker.");

  mqttClient.subscribe(commandTopic, (error) => {
    if (error) {
      console.error("MQTT subscription failed:", error);
      return;
    }

    console.log(`Subscribed to: ${commandTopic}`);

    publishState();
  });
});

mqttClient.on("message", (topic, message) => {
  const command = message.toString().trim().toUpperCase();

  console.log(`MQTT command received: ${command}`);

  if (topic !== commandTopic) {
    return;
  }

  if (command === "DISPENSE") {
    startDispensing();
  } else if (command === "RETRACT") {
    retractPiston();
  } else if (command === "STOP") {
    stopPiston();
  } else {
    console.log(`Unknown command: ${command}`);
  }
});

mqttClient.on("error", (error) => {
  console.error("MQTT error:", error.message);
});

console.log("SmartFoodSystem Device Simulator");
console.log("--------------------------------");

printState();