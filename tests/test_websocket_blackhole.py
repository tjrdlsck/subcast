"""Exercise a half-open editor socket through a TCP proxy that drops traffic."""

import asyncio
import json
import os
import socket

import pytest
import uvicorn
import websockets

from backend.schemas import ProjectData, Slide
from backend.services.connection_manager import manager


class TcpBlackhole:
    def __init__(self):
        self.forwarding = asyncio.Event()
        self.forwarding.set()
        self.server = None
        self.connections = set()

    async def start(self, upstream_port):
        self.server = await asyncio.start_server(
            lambda reader, writer: self._accept(reader, writer, upstream_port),
            "127.0.0.1", 0,
        )
        return self.server.sockets[0].getsockname()[1]

    async def _accept(self, client_reader, client_writer, upstream_port):
        upstream_reader, upstream_writer = await asyncio.open_connection("127.0.0.1", upstream_port)
        pipes = [
            asyncio.create_task(self._pipe(client_reader, upstream_writer)),
            asyncio.create_task(self._pipe(upstream_reader, client_writer)),
        ]
        self.connections.update(pipes)
        try:
            await asyncio.wait(pipes, return_when=asyncio.FIRST_COMPLETED)
        finally:
            for task in pipes:
                task.cancel()
            await asyncio.gather(*pipes, return_exceptions=True)
            self.connections.difference_update(pipes)
            client_writer.close()
            upstream_writer.close()
            await asyncio.gather(client_writer.wait_closed(), upstream_writer.wait_closed(), return_exceptions=True)

    async def _pipe(self, reader, writer):
        while True:
            data = await reader.read(65536)
            if not data:
                return
            await self.forwarding.wait()
            writer.write(data)
            await writer.drain()

    async def close(self):
        if self.server:
            self.server.close()
            await self.server.wait_closed()
        for task in list(self.connections):
            task.cancel()
        await asyncio.gather(*self.connections, return_exceptions=True)


def test_blackholed_editor_connection_releases_lock_after_ping_timeout():
    real_ping = os.environ.get("SUBCAST_TEST_REAL_PING") == "1"
    ping_interval, ping_timeout = (20.0, 20.0) if real_ping else (0.2, 0.6)
    scenario_timeout = 85 if real_ping else 30

    async def scenario():
        old_project = manager.project_data
        old_sessions = manager.sessions
        old_locks = manager.locked_slides
        manager.project_data = ProjectData(id="blackhole", slides=[Slide(id="slide_1", name="Test")])
        manager.sessions = {role: set() for role in ("editor", "presenter", "viewer")}
        manager.locked_slides = {}

        upstream_socket = socket.socket()
        upstream_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        upstream_socket.bind(("127.0.0.1", 0))
        upstream_socket.listen(128)
        upstream_socket.setblocking(False)
        upstream_port = upstream_socket.getsockname()[1]
        config = uvicorn.Config(
            "backend.main:app", host="127.0.0.1", port=upstream_port,
            ws="websockets", ws_ping_interval=ping_interval, ws_ping_timeout=ping_timeout,
            log_level="error", lifespan="off",
        )
        server = uvicorn.Server(config)
        server_task = asyncio.create_task(server.serve(sockets=[upstream_socket]))
        proxy = TcpBlackhole()
        proxy_port = None
        try:
            async with asyncio.timeout(5):
                while not server.started:
                    await asyncio.sleep(0.02)
            proxy_port = await proxy.start(upstream_port)
            async with websockets.connect(f"ws://127.0.0.1:{proxy_port}/ws?role=editor") as ws:
                initial = json.loads(await ws.recv())
                assert initial["type"] == "INITIAL_SYNC"
                await ws.send(json.dumps({"type": "LOCK_SLIDE", "slideId": "slide_1", "requestId": "owner"}))
                responses = [json.loads(await ws.recv()), json.loads(await ws.recv())]
                assert any(message["type"] == "LOCK_GRANTED" for message in responses)
                assert manager.locked_slides.get("slide_1")

                # Keep both TCP sockets open while silently discarding WebSocket frames.
                proxy.forwarding.clear()
                await asyncio.wait_for(_wait_until_unlocked(), timeout=75 if real_ping else 25)
                assert "slide_1" not in manager.locked_slides
                assert not manager.sessions["editor"]
        finally:
            proxy.forwarding.set()
            await proxy.close()
            server.should_exit = True
            try:
                await asyncio.wait_for(server_task, timeout=3)
            except asyncio.TimeoutError:
                server_task.cancel()
                await asyncio.gather(server_task, return_exceptions=True)
            manager.project_data = old_project
            manager.sessions = old_sessions
            manager.locked_slides = old_locks

    asyncio.run(asyncio.wait_for(scenario(), timeout=scenario_timeout))


async def _wait_until_unlocked():
    while "slide_1" in manager.locked_slides:
        await asyncio.sleep(0.025)
