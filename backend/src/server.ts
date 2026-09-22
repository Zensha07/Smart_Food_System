import express from "express";
import cors from "cors";
import mqtt from "mqtt";
import pool from "./db.js";
import authRouter from "./routes/auth.js";
import { requireAuth } from "./middleware/auth.js";

const app = express();
const PORT = 3000;

const MQTT_BROKER = "mqtt://localhost:1883";
const DEVICE_ID = "device-001";

const commandTopic = `smartfood/${DEVICE_ID}/command`;
const stateTopic = `smartfood/${DEVICE_ID}/state`;

app.use(cors());
app.use(express.json());
app.use("/api/auth", authRouter);

const mqttClient = mqtt.connect(MQTT_BROKER);

interface DeviceState {
  deviceId: string;
  state: "IDLE" | "DISPENSING" | "RETRACTING" | "FAULT";
  position: number;
  temperature: number;
  heating: boolean;
  plateDetected?: boolean;
  cooldownActive?: boolean;
  targetPortion?: number;
}

let latestDeviceState: DeviceState = {
  deviceId: DEVICE_ID,
  state: "IDLE",
  position: 0,
  temperature: 25,
  heating: false,
  plateDetected: true,
  cooldownActive: false,
  targetPortion: 100,
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

app.post("/api/device/dispense", requireAuth, (req, res) => {
  const portion = Number(req.body?.portion) || 100;
  const command = portion < 100 ? `DISPENSE:${portion}` : "DISPENSE";
  mqttClient.publish(commandTopic, command);

  res.json({
    success: true,
    command,
    portion,
  });
});

app.post("/api/device/retract", requireAuth, (_req, res) => {
  mqttClient.publish(commandTopic, "RETRACT");

  res.json({
    success: true,
    command: "RETRACT",
  });
});

app.post("/api/device/stop", requireAuth, (_req, res) => {
  mqttClient.publish(commandTopic, "STOP");

  res.json({
    success: true,
    command: "STOP",
  });
});

app.post("/api/device/stop-all", requireAuth, (_req, res) => {
  mqttClient.publish(commandTopic, "STOP_ALL");

  res.json({
    success: true,
    command: "STOP_ALL",
  });
});

app.post("/api/device/heat/start", requireAuth, (_req, res) => {
  mqttClient.publish(commandTopic, "HEAT_START");

  res.json({
    success: true,
    command: "HEAT_START",
  });
});

app.post("/api/device/heat/stop", requireAuth, (_req, res) => {
  mqttClient.publish(commandTopic, "HEAT_STOP");

  res.json({
    success: true,
    command: "HEAT_STOP",
  });
});

app.post("/api/device/plate", requireAuth, (req, res) => {
  const detected = req.body?.detected !== false;
  const command = detected ? "SET_PLATE:TRUE" : "SET_PLATE:FALSE";
  mqttClient.publish(commandTopic, command);

  res.json({
    success: true,
    command,
    plateDetected: detected,
  });
});

app.post("/api/device/fault", requireAuth, (req, res) => {
  const fault = req.body?.fault === true;
  const command = fault ? "TRIGGER_FAULT" : "CLEAR_FAULT";
  mqttClient.publish(commandTopic, command);

  res.json({
    success: true,
    command,
    fault,
  });
});

pool.query("SELECT NOW()")
  .then(() => {
    console.log("PostgreSQL connected successfully.");
  })
  .catch((error) => {
    console.error("PostgreSQL connection failed:", error.message);
  });

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});