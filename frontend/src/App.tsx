import { useEffect, useState } from "react";
import Auth from "./Auth";
import Dashboard from "./Dashboard";

type User = {
  id: number;
  name: string;
  email: string;
  token: string;
};

function App() {
  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem("smartfood_user");

    if (!savedUser) {
      return null;
    }

    try {
      return JSON.parse(savedUser);
    } catch {
      localStorage.removeItem("smartfood_user");
      return null;
    }
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem(
        "smartfood_user",
        JSON.stringify(user)
      );
    } else {
      localStorage.removeItem("smartfood_user");
    }
  }, [user]);

  if (!user) {
    return <Auth onLogin={setUser} />;
  }

  return (
    <Dashboard
      user={user}
      onLogout={() => setUser(null)}
    />
  );
}

export default App;