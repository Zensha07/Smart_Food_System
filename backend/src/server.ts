import express from "express";
import cors from "cors";
import mqtt from "mqtt";

const app = express();
const PORT = 3000;

const MQTT_BROKER = "mqtt://localhost:1883";
const DEVICE_ID = "device-001";

const commandTopic = `smartfood/${DEVICE_ID}/command`;
const stateTopic = `smartfood/${DEVICE_ID}/state`;

app.use(cors());
app.use(express.json());

const mqttClient = mqtt.connect(MQTT_BROKER);

let latestDeviceState = {
  deviceId: DEVICE_ID,
  state: "IDLE",
  position: 0,
};

const sseClients = new Set<express.Response>();

mqttClient.on("connect", () => {
  console.log("Backend connected to MQTT broker.");

  mqttClient.subscribe(stateTopic, (error) => {
    if (error) {
      console.error("MQTT state subscription failed:", error);
      return;
    }

    console.log(`Backend subscribed to: ${stateTopic}`);
  });
});

mqttClient.on("message", (topic, message) => {
  if (topic !== stateTopic) {
    return;
  }

  try {
    latestDeviceState = JSON.parse(message.toString());

    console.log("Device state:", latestDeviceState);

    const data = `data: ${JSON.stringify(latestDeviceState)}\n\n`;

    for (const client of sseClients) {
      client.write(data);
    }
  } catch (error) {
    console.error("Invalid device state:", error);
  }
});

mqttClient.on("error", (error) => {
  console.error("MQTT error:", error.message);
});

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "SmartFoodSystem backend",
  });
});

app.get("/api/device/state", (_req, res) => {
  res.json(latestDeviceState);
});

app.get("/api/device/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  res.flushHeaders();

  sseClients.add(res);

  res.write(
    `data: ${JSON.stringify(latestDeviceState)}\n\n`
  );

  req.on("close", () => {
    sseClients.delete(res);
  });
});

app.post("/api/device/dispense", (_req, res) => {
  mqttClient.publish(commandTopic, "DISPENSE");

  res.json({
    success: true,
    command: "DISPENSE",
  });
});

app.post("/api/device/retract", (_req, res) => {
  mqttClient.publish(commandTopic, "RETRACT");

  res.json({
    success: true,
    command: "RETRACT",
  });
});

app.post("/api/device/stop", (_req, res) => {
  mqttClient.publish(commandTopic, "STOP");

  res.json({
    success: true,
    command: "STOP",
  });
});

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});