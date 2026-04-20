export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24, maxWidth: 820 }}>
      <h1 style={{ marginBottom: 8 }}>Rate-Limited API Service</h1>
      <p style={{ marginTop: 0, opacity: 0.85 }}>
        Endpoints: <code>POST /request</code> and <code>GET /stats</code>.
      </p>

      <h2 style={{ marginTop: 24 }}>POST /request</h2>
      <pre style={{ background: "#111", color: "#fff", padding: 12, borderRadius: 8, overflowX: "auto" }}>
        {`curl -s -X POST http://localhost:3000/request \\
  -H "Content-Type: application/json" \\
  -d '{"user_id":"u1","payload":{"hello":"world"}}'`}
      </pre>

      <h2 style={{ marginTop: 24 }}>GET /stats</h2>
      <pre style={{ background: "#111", color: "#fff", padding: 12, borderRadius: 8, overflowX: "auto" }}>
        {`curl -s http://localhost:3000/stats`}
      </pre>
    </main>
  );
}
