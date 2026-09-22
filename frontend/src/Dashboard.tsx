import { useEffect, useState } from "react";

type DeviceState = {
  deviceId: string;
  state: "IDLE" | "DISPENSING" | "RETRACTING" | "FAULT";
  position: number;
  temperature: number;
  heating: boolean;
  plateDetected?: boolean;
  cooldownActive?: boolean;
  targetPortion?: number;
};

type DashboardProps = {
  user: {
    id: number;
    name: string;
    email: string;
    token: string;
  };
  onLogout: () => void;
};

type SystemMode = "FULL_SYSTEM" | "PISTON_ONLY";

function Dashboard({ user, onLogout }: DashboardProps) {
  const [deviceState, setDeviceState] = useState<DeviceState>({
    deviceId: "device-001",
    state: "IDLE",
    position: 0,
    temperature: 25,
    heating: false,
    plateDetected: true,
    cooldownActive: false,
    targetPortion: 100,
  });

  const [mode, setMode] = useState<SystemMode>("FULL_SYSTEM");
  const [targetTemperature] = useState<number>(60);
  const [selectedPortion, setSelectedPortion] = useState<number>(100);
  const [message, setMessage] = useState("");
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const events = new EventSource(
      "http://localhost:3000/api/device/events"
    );

    events.onopen = () => {
      setIsConnected(true);
    };

    events.onmessage = (event) => {
      try {
        const data: DeviceState = JSON.parse(event.data);
        setDeviceState(data);
        setIsConnected(true);
      } catch (err) {
        console.error("Failed to parse device state SSE:", err);
      }
    };

    events.onerror = () => {
      setIsConnected(false);
      setMessage("Connection to device backend lost");
    };

    return () => {
      events.close();
    };
  }, []);

  async function apiPost(endpoint: string, body?: any) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.message || "Request failed");
    }

    return response.json();
  }

  async function sendPistonCommand(
    command: "DISPENSE" | "RETRACT" | "STOP"
  ) {
    try {
      if (command === "DISPENSE") {
        if (!deviceState.plateDetected) {
          setMessage("Safety Interlock: Dispense blocked! Please place a plate under the nozzle.");
          return;
        }
        setMessage(`Dispensing ${selectedPortion}% portion...`);
        const data = await apiPost("http://localhost:3000/api/device/dispense", {
          portion: selectedPortion,
        });
        setMessage(`Command dispatched: ${data.command}`);
      } else if (command === "RETRACT") {
        setMessage("Retracting piston home...");
        const data = await apiPost("http://localhost:3000/api/device/retract");
        setMessage(`Command dispatched: ${data.command}`);
      } else {
        setMessage("Stopping piston motion...");
        const data = await apiPost("http://localhost:3000/api/device/stop");
        setMessage(`Command dispatched: ${data.command}`);
      }
    } catch (error: any) {
      setMessage(error.message || "Unable to send piston command");
    }
  }

  async function sendHeatingCommand(
    command: "HEAT_START" | "HEAT_STOP"
  ) {
    try {
      setMessage(
        command === "HEAT_START"
          ? "Starting food heating..."
          : "Stopping heating..."
      );

      const endpoint =
        command === "HEAT_START"
          ? "http://localhost:3000/api/device/heat/start"
          : "http://localhost:3000/api/device/heat/stop";

      const data = await apiPost(endpoint);
      setMessage(`Command dispatched: ${data.command}`);
    } catch (error: any) {
      setMessage(error.message || "Unable to send heating command");
    }
  }

  async function sendStopAll() {
    try {
      setMessage("EMERGENCY STOP ALL triggered!");
      const data = await apiPost("http://localhost:3000/api/device/stop-all");
      setMessage(`All mechanisms halted: ${data.command}`);
    } catch (error: any) {
      setMessage(error.message || "Emergency stop command failed");
    }
  }

  async function togglePlateSensor() {
    try {
      const nextState = !deviceState.plateDetected;
      await apiPost("http://localhost:3000/api/device/plate", {
        detected: nextState,
      });
      setMessage(nextState ? "Plate detected on tray." : "Plate removed from tray.");
    } catch (error: any) {
      setMessage(error.message || "Unable to update plate sensor");
    }
  }

  async function toggleFault() {
    try {
      const isFault = deviceState.state === "FAULT";
      await apiPost("http://localhost:3000/api/device/fault", {
        fault: !isFault,
      });
      setMessage(!isFault ? "Simulated FAULT condition triggered!" : "Fault condition cleared.");
    } catch (error: any) {
      setMessage(error.message || "Unable to toggle fault state");
    }
  }

  const isMoving =
    deviceState.state === "DISPENSING" ||
    deviceState.state === "RETRACTING";

  const isFault = deviceState.state === "FAULT";
  const plateOk = deviceState.plateDetected !== false;
  const isSafeTemp = deviceState.temperature >= 50;

  // Heating Status
  let heatingStatusText = "STANDBY";
  let heatingStatusClass = "status-standby";

  if (isFault) {
    heatingStatusText = "FAULT";
    heatingStatusClass = "status-fault";
  } else if (deviceState.heating) {
    heatingStatusText = "HEATING ACTIVE";
    heatingStatusClass = "status-heating";
  } else if (deviceState.cooldownActive) {
    heatingStatusText = "CHAMBER COOLING";
    heatingStatusClass = "status-cooling";
  } else if (deviceState.temperature >= targetTemperature) {
    heatingStatusText = "TARGET REACHED";
    heatingStatusClass = "status-holding";
  }

  const cannotStartHeating =
    deviceState.heating ||
    deviceState.temperature >= targetTemperature ||
    isFault ||
    !isConnected;

  const cannotStopHeating = !deviceState.heating || isFault || !isConnected;

  const cannotDispense =
    isMoving ||
    isFault ||
    !isConnected ||
    !plateOk ||
    (mode === "FULL_SYSTEM" && !isSafeTemp && deviceState.position === 0);

  const tempPercent = Math.min(
    100,
    Math.max(0, (deviceState.temperature / 100) * 100)
  );

  return (
    <div className="app">
      {/* HEADER */}
      <header className="header">
        <div className="brand">
          <div className="brand-logo">
            <span className="logo-box">S</span>
          </div>
          <div>
            <h1>Smart Food System</h1>
            <p className="brand-sub">Autonomous Heating & Dispensing Controller</p>
          </div>
        </div>

        {/* MODE SWITCHER PILLS */}
        <div className="mode-switcher">
          <button
            className={`mode-btn ${mode === "FULL_SYSTEM" ? "active" : ""}`}
            onClick={() => setMode("FULL_SYSTEM")}
          >
            <span className="mode-icon">🍲</span>
            Full System Simulation
          </button>
          <button
            className={`mode-btn ${mode === "PISTON_ONLY" ? "active" : ""}`}
            onClick={() => setMode("PISTON_ONLY")}
          >
            <span className="mode-icon">⚙️</span>
            Piston-Only Hardware
          </button>
        </div>

        {/* HEADER CONTROLS & USER */}
        <div className="header-right">
          <button
            className="stop-all-btn"
            onClick={sendStopAll}
            title="Emergency halt both piston and heating"
          >
            STOP ALL
          </button>

          <div className={`connection-pill ${isConnected ? "online" : "offline"}`}>
            <span className="connection-dot"></span>
            {isConnected ? "Device Connected" : "Connecting..."}
          </div>

          <div className="user-section">
            <div className="user-avatar">{user.name.charAt(0).toUpperCase()}</div>
            <div className="user-meta">
              <span className="user-name">{user.name}</span>
              <button className="logout-link" onClick={onLogout}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* SUBHEADER: SAFETY & TELEMETRY BAR */}
      <div className="telemetry-bar">
        <div className="telemetry-item">
          <span className="telemetry-label">DEVICE STATUS</span>
          <span className={`telemetry-val ${isFault ? "text-danger" : "text-success"}`}>
            {deviceState.state}
          </span>
        </div>

        <div className="telemetry-divider"></div>

        <div className="telemetry-item">
          <span className="telemetry-label">PLATE SENSOR</span>
          <button
            className={`sensor-toggle-btn ${plateOk ? "plate-ok" : "plate-missing"}`}
            onClick={togglePlateSensor}
            title="Click to toggle simulated plate sensor"
          >
            {plateOk ? "✔ Plate Present" : "✖ No Plate Detected"}
          </button>
        </div>

        <div className="telemetry-divider"></div>

        <div className="telemetry-item">
          <span className="telemetry-label">SERVING TEMP CHECK</span>
          <span className={`telemetry-val ${isSafeTemp ? "text-success" : "text-warning"}`}>
            {isSafeTemp ? "✔ Ready (>=50°C)" : "⚠ Cold (<50°C)"}
          </span>
        </div>

        <div className="telemetry-divider"></div>

        <div className="telemetry-item">
          <span className="telemetry-label">FAULT SIMULATOR</span>
          <button
            className={`fault-toggle-btn ${isFault ? "fault-active" : ""}`}
            onClick={toggleFault}
          >
            {isFault ? "Clear Device Fault" : "Trigger Jam / Fault"}
          </button>
        </div>
      </div>

      {/* FAULT NOTIFICATION BANNER */}
      {isFault && (
        <div className="alert-banner danger">
          <div className="alert-icon">⚠</div>
          <div className="alert-text">
            <strong>CRITICAL FAULT DETECTED:</strong> All hardware movement and heating have been
            interlocked and halted. Inspect mechanism and click "Clear Device Fault" above to resume.
          </div>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <main className="main">
        <div className="dashboard-container">
          {/* MODE BANNER NOTICE */}
          {mode === "PISTON_ONLY" && (
            <div className="info-banner">
              <div className="info-badge">CALIBRATION MODE</div>
              <span>
                <strong>Piston-Only Hardware Mode:</strong> Temperature requirements are bypassed.
                Directly testing motor positioning, portion calibration, and limit switches.
              </span>
            </div>
          )}

          {/* DASHBOARD CARDS GRID */}
          <div className={`dashboard-grid ${mode === "PISTON_ONLY" ? "single-column" : ""}`}>
            {/* 1. FOOD CHAMBER HEATING (VISIBLE IN FULL_SYSTEM MODE ONLY) */}
            {mode === "FULL_SYSTEM" && (
              <section className="card">
                <div className="card-top">
                  <div>
                    <span className="card-kicker">THERMAL SUBSYSTEM</span>
                    <h2>Food Chamber Temperature</h2>
                    <p className="card-desc">Heating element & thermal holding</p>
                  </div>
                  <span className={`status-badge ${heatingStatusClass}`}>
                    {heatingStatusText}
                  </span>
                </div>

                {/* TEMPERATURE METRIC BLOCK */}
                <div className="temp-block">
                  <div className="temp-hero">
                    <div className="temp-number-group">
                      <span className="temp-val">{deviceState.temperature}</span>
                      <span className="temp-deg">°C</span>
                    </div>

                    <div className="temp-metrics-side">
                      <div className="metric-pill">
                        <span className="lbl">Target</span>
                        <strong>{targetTemperature}°C</strong>
                      </div>
                      <div className="metric-pill">
                        <span className="lbl">State</span>
                        <strong className={deviceState.heating ? "text-warning" : "text-muted"}>
                          {deviceState.heating ? "Active" : deviceState.cooldownActive ? "Cooling" : "Idle"}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* GAUGE BAR */}
                  <div className="meter-container">
                    <div className="meter-track">
                      <div
                        className={`meter-fill ${deviceState.heating ? "heating" : deviceState.cooldownActive ? "cooling" : "standby"}`}
                        style={{ width: `${tempPercent}%` }}
                      ></div>
                    </div>
                    <div className="meter-scale">
                      <span>0°C (Ambient)</span>
                      <span>Target: {targetTemperature}°C</span>
                      <span>100°C</span>
                    </div>
                  </div>

                  {/* COOLDOWN NOTIFICATION */}
                  {deviceState.cooldownActive && (
                    <div className="cooldown-note">
                      <span className="pulse-dot"></span>
                      Food was dispensed! Empty container is gradually cooling down to ambient.
                    </div>
                  )}
                </div>

                {/* HEATING CONTROLS */}
                <div className="card-actions">
                  <button
                    className="btn btn-primary heat-start"
                    onClick={() => sendHeatingCommand("HEAT_START")}
                    disabled={cannotStartHeating}
                  >
                    START HEATING
                  </button>

                  <button
                    className="btn btn-secondary"
                    onClick={() => sendHeatingCommand("HEAT_STOP")}
                    disabled={cannotStopHeating}
                  >
                    STOP HEATING
                  </button>
                </div>
              </section>
            )}

            {/* 2. PISTON DISPENSING CARD */}
            <section className="card">
              <div className="card-top">
                <div>
                  <span className="card-kicker">DISPENSE MECHANISM</span>
                  <h2>Piston Dispensing & Retract</h2>
                  <p className="card-desc">Food portion extrusion & home return</p>
                </div>
                <span
                  className={`status-badge status-${deviceState.state.toLowerCase()}`}
                >
                  {deviceState.state}
                </span>
              </div>

              {/* PORTION SELECTOR (PHASE H) */}
              <div className="portion-section">
                <span className="section-label">SELECT DISPENSE PORTION:</span>
                <div className="portion-chips">
                  {[
                    { label: "Small (50%)", value: 50 },
                    { label: "Standard (75%)", value: 75 },
                    { label: "Full (100%)", value: 100 },
                  ].map((p) => (
                    <button
                      key={p.value}
                      className={`portion-chip ${selectedPortion === p.value ? "active" : ""}`}
                      onClick={() => setSelectedPortion(p.value)}
                      disabled={isMoving || isFault}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* PISTON POSITION GAUGE */}
              <div className="position-block">
                <div className="position-head">
                  <span className="pos-title">Piston Extension</span>
                  <div className="pos-val-group">
                    <span className="pos-val">{deviceState.position}%</span>
                    <span className="pos-sub">/ {selectedPortion}% target</span>
                  </div>
                </div>

                <div className="meter-track">
                  <div
                    className="meter-fill piston"
                    style={{ width: `${deviceState.position}%` }}
                  ></div>
                </div>
              </div>

              {/* INTERLOCK WARNING (WHEN TEMP IS COLD IN FULL MODE) */}
              {mode === "FULL_SYSTEM" && !isSafeTemp && deviceState.position === 0 && (
                <div className="interlock-warning">
                  <span className="interlock-icon">🔒</span>
                  <span>
                    <strong>Dispense Interlock:</strong> Chamber temperature ({deviceState.temperature}°C) is below 50°C.
                    Heat food before serving, or switch to <em>Piston-Only Hardware</em> mode to bypass.
                  </span>
                </div>
              )}

              {/* INTERLOCK WARNING (NO PLATE) */}
              {!plateOk && (
                <div className="interlock-warning danger">
                  <span className="interlock-icon">🚫</span>
                  <span>
                    <strong>No Plate Detected:</strong> Place a plate under the nozzle (toggle "Plate Sensor" above) to allow dispensing.
                  </span>
                </div>
              )}

              {/* PISTON CONTROLS */}
              <div className="card-actions">
                <button
                  className="btn btn-primary dispense"
                  onClick={() => sendPistonCommand("DISPENSE")}
                  disabled={cannotDispense}
                >
                  DISPENSE ({selectedPortion}%)
                </button>

                <button
                  className="btn btn-secondary"
                  onClick={() => sendPistonCommand("RETRACT")}
                  disabled={isMoving || isFault || !isConnected || deviceState.position === 0}
                >
                  RETRACT HOME
                </button>

                <button
                  className="btn btn-danger"
                  onClick={() => sendPistonCommand("STOP")}
                  disabled={!isMoving || !isConnected}
                >
                  STOP PISTON
                </button>
              </div>
            </section>
          </div>

          {/* STATUS MESSAGE BAR */}
          <div className="system-message-card">
            <span className="msg-icon">ℹ</span>
            <span className="msg-text">{message || "All systems nominal and ready."}</span>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Dashboard;