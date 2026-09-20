import { useEffect, useState } from "react";

type DeviceState = {
  deviceId: string;
  state: "IDLE" | "DISPENSING" | "RETRACTING" | "FAULT";
  position: number;
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
  });

  const [message, setMessage] = useState("");

  useEffect(() => {
    const events = new EventSource(
      "http://localhost:3000/api/device/events"
    );

    events.onmessage = (event) => {
      const data: DeviceState = JSON.parse(event.data);

      setDeviceState(data);
    };

    events.onerror = () => {
      setMessage("Connection to backend lost");
    };

    return () => {
      events.close();
    };
  }, []);

  async function sendCommand(
    command: "DISPENSE" | "RETRACT" | "STOP"
  ) {
    try {
      setMessage("Sending command...");

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
        throw new Error("Command failed");
      }

      const data = await response.json();

      setMessage(`Command sent: ${data.command}`);
    } catch (error) {
      console.error(error);
      setMessage("Unable to send command");
    }
  }

  const isMoving =
    deviceState.state === "DISPENSING" ||
    deviceState.state === "RETRACTING";

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

        <section className="card">

          <div className="card-header">

            <div>
              <h2>Piston Control</h2>

              <p>
                Control the food dispensing piston
              </p>
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

              <strong>
                {deviceState.position}%
              </strong>

            </div>

            <div className="progress-bar">

              <div
                className="progress"
                style={{
                  width: `${deviceState.position}%`,
                }}
              ></div>

            </div>

          </div>

          <div className="controls">

            <button
              className="dispense-button"
              onClick={() => sendCommand("DISPENSE")}
              disabled={isMoving}
            >
              DISPENSE
            </button>

            <button
              className="retract-button"
              onClick={() => sendCommand("RETRACT")}
              disabled={isMoving}
            >
              RETRACT
            </button>

            <button
              className="stop-button"
              onClick={() => sendCommand("STOP")}
              disabled={!isMoving}
            >
              STOP
            </button>

          </div>

          <div className="message">
            {message || "System ready"}
          </div>

        </section>

      </main>

    </div>
  );
}

export default Dashboard;