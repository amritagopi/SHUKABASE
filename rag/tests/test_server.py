import pytest
from flask import Flask
import json
import os
import sys

# Import app from rag_api_server
# We need to make sure we don't accidentally start the server or fail imports
# conftest.py adds global path, so:
from rag.rag_api_server import app, rag_engine_instance, initialize_engine, DATA_DIR

@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client

def test_health_check(client):
    """Test the /api/health endpoint."""
    response = client.get('/api/health')
    assert response.status_code == 200
    data = json.loads(response.data)
    assert 'status' in data
    assert data['status'] == 'healthy'

def test_setup_status(client):
    """Test /api/setup/status."""
    response = client.get('/api/setup/status')
    assert response.status_code == 200
    data = json.loads(response.data)
    assert 'installed' in data

def test_search_endpoint_not_initialized(client, mocker):
    """Test search when engine is not initialized."""
    # Ensure global instance is None
    mocker.patch('rag.rag_api_server.rag_engine_instance', None)
    mocker.patch('rag.rag_api_server.initialize_engine', return_value=False)
    
    response = client.post('/api/search', json={'query': 'test'})
    assert response.status_code == 503
    data = json.loads(response.data)
    assert data['success'] is False

def test_search_endpoint_success(client, mocker, mock_rag_engine):
    """Test successful search via API."""
    # Mock the global engine instance
    mocker.patch('rag.rag_api_server.rag_engine_instance', mock_rag_engine)
    
    # Mock search method
    mock_rag_engine.search = mocker.MagicMock(return_value={
        'success': True,
        'results': [{'text': 'Test Result'}]
    })
    
    response = client.post('/api/search', json={'query': 'krishna'})
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data['success'] is True
    assert len(data['results']) == 1
    assert data['results'][0]['text'] == 'Test Result'
