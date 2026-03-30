"""Temporal worker entrypoint for the grading service."""

import asyncio
import logging
import os

from temporalio.client import Client

from services.workers.worker_common import GRADING_TASK_QUEUE, create_worker

logger = logging.getLogger(__name__)


async def main() -> None:
    temporal_address = os.environ.get("TEMPORAL_ADDRESS", "localhost:7233")

    logger.info("Connecting to Temporal at %s", temporal_address)
    client = await Client.connect(temporal_address)

    # Register with Mission Control on startup and send initial heartbeat
    from services.workers.activities.grading import mc_register_agent, _mc_heartbeat
    await mc_register_agent()
    await _mc_heartbeat()
    logger.info("Mission Control agent registration sent")

    logger.info("Starting worker on task queue: %s", GRADING_TASK_QUEUE)
    worker = await create_worker(client, GRADING_TASK_QUEUE)
    await worker.run()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
