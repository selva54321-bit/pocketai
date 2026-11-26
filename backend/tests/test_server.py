from fastapi.testclient import TestClient
from app.server import app, _recent_queries

client = TestClient(app)

def test_query_deduplication():
    _recent_queries.clear()
    
    # First query
    resp1 = client.post("/api/v1/query", json={"query": "open camera"})
    assert resp1.status_code == 200
    data1 = resp1.json()
    assert data1["status"] in ["executed", "proposed"]
    assert len(data1["calls"]) > 0
    assert data1["calls"][0]["name"] == "open_camera"
    
    # Second identical query immediately (within 2 seconds)
    resp2 = client.post("/api/v1/query", json={"query": "open camera"})
    assert resp2.status_code == 200
    data2 = resp2.json()
    # Should return identical cached response
    assert data2["status"] == data1["status"]
    assert data2["calls"] == data1["calls"]

def test_query_different_not_deduplicated():
    _recent_queries.clear()
    
    resp1 = client.post("/api/v1/query", json={"query": "open camera"})
    assert resp1.status_code == 200
    assert resp1.json()["calls"][0]["name"] == "open_camera"
    
    resp2 = client.post("/api/v1/query", json={"query": "play Tamil songs on youtube"})
    assert resp2.status_code == 200
    assert resp2.json()["calls"][0]["name"] == "search_youtube"
