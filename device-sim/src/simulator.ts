import mqtt from "mqtt";

type PistonState =
  | "IDLE"
  | "DISPENSING"
  | "RETRACTING"
  | "FAULT";

let state: PistonState = "IDLE";
let position = 0;
let activeInterval: ReturnType<typeof setInterval> | null = null;

let temperature = 25;
let heating = false;
const TARGET_TEMPERATURE = 60;
const AMBIENT_TEMPERATURE = 25;
let heatingInterval: ReturnType<typeof setInterval> | null = null;
let coolingInterval: ReturnType<typeof setInterval> | null = null;

let plateDetected = true;
let cooldownActive = false;
let dispensedFood = false;
let targetPortion = 100;

const DEVICE_ID = "device-001";
const MQTT_BROKER = "mqtt://localhost:1883";

const commandTopic = `smartfood/${DEVICE_ID}/command`;
const stateTopic = `smartfood/${DEVICE_ID}/state`;

const mqttClient = mqtt.connect(MQTT_BROKER);

function printState() {
  console.log(
    `State: ${state} | Pos: ${position}% | Temp: ${temperature}°C | Heat: ${heating} | Plate: ${plateDetected} | Cool: ${cooldownActive}`
  );
}

function publishState() {
  mqttClient.publish(
    stateTopic,
    JSON.stringify({
      deviceId: DEVICE_ID,
      state,
      position,
      temperature,
      heating,
      plateDetected,
      cooldownActive,
      targetPortion,
    })
  );
}

function startCooling() {
  if (coolingInterval !== null || heating) {
    return;
  }

  cooldownActive = true;
  console.log("Container cooling initiated...");
  publishState();

  coolingInterval = setInterval(() => {
    if (heating) {
      stopCooling();
      return;
    }

    if (temperature > AMBIENT_TEMPERATURE) {
      temperature = Math.max(AMBIENT_TEMPERATURE, temperature - 2);
      printState();
      publishState();
    }

    if (temperature <= AMBIENT_TEMPERATURE) {
      console.log("Container reached ambient temperature.");
      stopCooling();
      dispensedFood = false;
      printState();
      publishState();
    }
  }, 1000);
}

function stopCooling() {
  if (coolingInterval !== null) {
    clearInterval(coolingInterval);
    coolingInterval = null;
  }
  cooldownActive = false;
}

function startDispensing(portion: number = 100) {
  if (state === "FAULT") {
    console.log("Cannot dispense: Device is in FAULT state.");
    return;
  }

  if (state !== "IDLE") {
    console.log(`Cannot dispense. Current state: ${state}`);
    return;
  }

  if (!plateDetected) {
    console.log("SAFETY INTERLOCK: Dispense blocked — No plate detected under nozzle!");
    return;
  }

  targetPortion = Math.min(100, Math.max(10, portion));
  console.log(`Starting piston dispense to portion ${targetPortion}%...`);

  state = "DISPENSING";
  publishState();

  activeInterval = setInterval(() => {
    position += 10;

    if (position >= targetPortion) {
      position = targetPortion;
      clearInterval(activeInterval!);
      activeInterval = null;

      state = "IDLE";
      dispensedFood = true;

      console.log(`Dispensing complete at ${position}%.`);
      printState();
      publishState();

      return;
    }

    printState();
    publishState();
  }, 500);
}

function retractPiston() {
  if (state === "FAULT") {
    console.log("Cannot retract: Device is in FAULT state.");
    return;
  }

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

      // If food was dispensed, container cools down
      if (dispensedFood && temperature > AMBIENT_TEMPERATURE) {
        console.log("Food dispensed and chamber empty. Starting container cooldown.");
        startCooling();
      }

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
    console.log(`Cannot stop piston. Current state: ${state}`);
  }
}

function startHeating() {
  if (state === "FAULT") {
    console.log("Cannot heat: Device in FAULT state.");
    return;
  }

  if (heating) {
    console.log("Heating already in progress.");
    return;
  }

  if (temperature >= TARGET_TEMPERATURE) {
    console.log(
      `Temperature already at or above target (${TARGET_TEMPERATURE}°C).`
    );
    return;
  }

  stopCooling();

  console.log("Starting heating...");
  heating = true;
  printState();
  publishState();

  heatingInterval = setInterval(() => {
    temperature += 5;

    if (temperature >= TARGET_TEMPERATURE) {
      temperature = TARGET_TEMPERATURE;
      clearInterval(heatingInterval!);
      heatingInterval = null;
      heating = false;

      console.log("Target temperature reached.");
      printState();
      publishState();
      return;
    }

    printState();
    publishState();
  }, 1000);
}

function stopHeating() {
  if (heatingInterval !== null) {
    clearInterval(heatingInterval);
    heatingInterval = null;
  }

  if (heating) {
    heating = false;
    console.log("Heating stopped.");
    printState();
    publishState();
  } else {
    console.log("Heating is already off.");
  }
}

function stopAll() {
  console.log("EMERGENCY STOP ALL received!");
  if (activeInterval !== null) {
    clearInterval(activeInterval);
    activeInterval = null;
  }
  if (heatingInterval !== null) {
    clearInterval(heatingInterval);
    heatingInterval = null;
  }
  heating = false;
  if (state === "DISPENSING" || state === "RETRACTING") {
    state = "IDLE";
  }
  printState();
  publishState();
}

function triggerFault() {
  console.log("FAULT condition triggered!");
  if (activeInterval !== null) {
    clearInterval(activeInterval);
    activeInterval = null;
  }
  if (heatingInterval !== null) {
    clearInterval(heatingInterval);
    heatingInterval = null;
  }
  heating = false;
  state = "FAULT";
  printState();
  publishState();
}

function clearFault() {
  console.log("FAULT cleared. Resetting to IDLE.");
  state = "IDLE";
  printState();
  publishState();
}

function setPlate(detected: boolean) {
  plateDetected = detected;
  console.log(`Plate detection sensor state: ${plateDetected}`);
  printState();
  publishState();
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
  const rawCommand = message.toString().trim();
  const command = rawCommand.toUpperCase();

  console.log(`MQTT command received: ${rawCommand}`);

  if (topic !== commandTopic) {
    return;
  }

  if (command.startsWith("DISPENSE")) {
    const parts = command.split(":");
    const portionStr = parts[1];
    const portion = portionStr !== undefined ? parseInt(portionStr, 10) : 100;
    startDispensing(isNaN(portion) ? 100 : portion);
  } else if (command === "RETRACT") {
    retractPiston();
  } else if (command === "STOP") {
    stopPiston();
  } else if (command === "STOP_ALL") {
    stopAll();
  } else if (command === "HEAT_START") {
    startHeating();
  } else if (command === "HEAT_STOP") {
    stopHeating();
  } else if (command === "SET_PLATE:TRUE" || command === "PLATE_ON") {
    setPlate(true);
  } else if (command === "SET_PLATE:FALSE" || command === "PLATE_OFF") {
    setPlate(false);
  } else if (command === "TRIGGER_FAULT") {
    triggerFault();
  } else if (command === "CLEAR_FAULT") {
    clearFault();
  } else {
    console.log(`Unknown command: ${rawCommand}`);
  }
});

mqttClient.on("error", (error) => {
  console.error("MQTT error:", error.message);
});

console.log("SmartFoodSystem Advanced Device Simulator (Phase H Active)");
console.log("---------------------------------------------------------");

printState();