import { useEffect, useState } from "react";

type DeviceState = {
  deviceId: string;
  state: "IDLE" | "DISPENSING" | "RETRACTING" | "FAULT";
  position: number;
  temperature: number;
  heating: boolean;
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

function Dashboard({ user, onLogout }: DashboardProps) {
  const [deviceState, setDeviceState] = useState<DeviceState>({
    deviceId: "device-001",
    state: "IDLE",
    position: 0,
    temperature: 25,
    heating: false,
  });

  const [targetTemperature] = useState<number>(60);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const events = new EventSource(
      "http://localhost:3000/api/device/events"
    );

    events.onmessage = (event) => {
      try {
        const data: DeviceState = JSON.parse(event.data);
        setDeviceState(data);
      } catch (err) {
        console.error("Failed to parse device state SSE:", err);
      }
    };

    events.onerror = () => {
      setMessage("Connection to backend lost");
    };

    return () => {
      events.close();
    };
  }, []);

  async function sendPistonCommand(
    command: "DISPENSE" | "RETRACT" | "STOP"
  ) {
    try {
      setMessage("Sending piston command...");

      let endpoint = "";
      if (command === "DISPENSE") {
        endpoint = "http://localhost:3000/api/device/dispense";
      } else if (command === "RETRACT") {
        endpoint = "http://localhost:3000/api/device/retract";
      } else {
        endpoint = "http://localhost:3000/api/device/stop";
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Piston command failed");
      }

      const data = await response.json();
      setMessage(`Command sent: ${data.command}`);
    } catch (error) {
      console.error(error);
      setMessage("Unable to send piston command");
    }
  }

  async function sendHeatingCommand(
    command: "HEAT_START" | "HEAT_STOP"
  ) {
    try {
      setMessage(
        command === "HEAT_START"
          ? "Starting heating..."
          : "Stopping heating..."
      );

      const endpoint =
        command === "HEAT_START"
          ? "http://localhost:3000/api/device/heat/start"
          : "http://localhost:3000/api/device/heat/stop";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Heating command failed");
      }

      const data = await response.json();
      setMessage(`Command sent: ${data.command}`);
    } catch (error) {
      console.error(error);
      setMessage("Unable to send heating command");
    }
  }

  const isMoving =
    deviceState.state === "DISPENSING" ||
    deviceState.state === "RETRACTING";

  const isFault = deviceState.state === "FAULT";

  // Heating status computation
  let heatingStatusText = "STANDBY";
  let heatingStatusClass = "idle";

  if (isFault) {
    heatingStatusText = "FAULT";
    heatingStatusClass = "fault";
  } else if (deviceState.heating) {
    heatingStatusText = "HEATING";
    heatingStatusClass = "heating";
  } else if (deviceState.temperature >= targetTemperature) {
    heatingStatusText = "TARGET REACHED";
    heatingStatusClass = "holding";
  }

  const cannotStartHeating =
    deviceState.heating ||
    deviceState.temperature >= targetTemperature ||
    isFault;

  const cannotStopHeating = !deviceState.heating || isFault;

  // Temperature progress relative to 0 - 100°C
  const tempPercent = Math.min(
    100,
    Math.max(0, (deviceState.temperature / 100) * 100)
  );

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Smart Food System</h1>
          <p>Device Control Panel</p>
        </div>

        <div className="header-right">
          <div className="connection">
            <span className="connection-dot"></span>
            Device Connected
          </div>

          <div className="user-section">
            <span>{user.name}</span>

            <button
              className="logout-button"
              onClick={onLogout}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="main">
        <div className="dashboard-container">
          <div className="dashboard-grid">
            {/* FOOD TEMPERATURE & HEATING CARD */}
            <section className="card">
              <div className="card-header">
                <div>
                  <h2>Food Temperature</h2>
                  <p>Chamber heating and temperature monitor</p>
                </div>

                <span className={`status ${heatingStatusClass}`}>
                  {heatingStatusText}
                </span>
              </div>

              <div className="temperature-section">
                <div className="temp-header">
                  <div className="temp-readout">
                    <span className="temp-value">
                      {deviceState.temperature}
                    </span>
                    <span className="temp-unit">°C</span>
                  </div>

                  <div className="target-badge">
                    Target: <strong>{targetTemperature}°C</strong>
                  </div>
                </div>

                <div className="progress-bar">
                  <div
                    className="progress temp-progress"
                    style={{
                      width: `${tempPercent}%`,
                    }}
                  ></div>
                </div>

                <div className="temp-scale-labels">
                  <span>0°C</span>
                  <span>Target: {targetTemperature}°C</span>
                  <span>100°C</span>
                </div>
              </div>

              <div className="controls">
                <button
                  className="heat-start-button"
                  onClick={() => sendHeatingCommand("HEAT_START")}
                  disabled={cannotStartHeating}
                >
                  START HEATING
                </button>

                <button
                  className="heat-stop-button"
                  onClick={() => sendHeatingCommand("HEAT_STOP")}
                  disabled={cannotStopHeating}
                >
                  STOP HEATING
                </button>
              </div>
            </section>

            {/* PISTON CONTROL CARD */}
            <section className="card">
              <div className="card-header">
                <div>
                  <h2>Piston Control</h2>
                  <p>Control the food dispensing piston</p>
                </div>

                <span
                  className={`status ${deviceState.state.toLowerCase()}`}
                >
                  {deviceState.state}
                </span>
              </div>

              <div className="position-section">
                <div className="position-label">
                  <span>Piston Position</span>
                  <strong>{deviceState.position}%</strong>
                </div>

                <div className="progress-bar">
                  <div
                    className="progress piston-progress"
                    style={{
                      width: `${deviceState.position}%`,
                    }}
                  ></div>
                </div>
              </div>

              <div className="controls">
                <button
                  className="dispense-button"
                  onClick={() => sendPistonCommand("DISPENSE")}
                  disabled={isMoving || isFault}
                >
                  DISPENSE
                </button>

                <button
                  className="retract-button"
                  onClick={() => sendPistonCommand("RETRACT")}
                  disabled={isMoving || isFault}
                >
                  RETRACT
                </button>

                <button
                  className="stop-button"
                  onClick={() => sendPistonCommand("STOP")}
                  disabled={!isMoving}
                >
                  STOP
                </button>
              </div>
            </section>
          </div>

          <div className="message">
            {message || "System ready"}
          </div>
        </div>
      </main>
    </div>
  );
}

export default Dashboard;