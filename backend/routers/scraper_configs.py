from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from typing import List, Dict, Optional
from uuid import UUID
import asyncio
import logging
import sys
from pathlib import Path

# Add parent directory to path so we can import modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from db.repositories import ScraperConfigRepository, LicitacionRepository
from models.scraper_config import ScraperConfig, ScraperConfigCreate, ScraperConfigUpdate
from dependencies import get_scraper_config_repository, get_licitacion_repository
from scrapers.scraper_factory import create_scraper

logger = logging.getLogger("api.scraper_configs")

router = APIRouter(
    prefix="/api/scraper-configs",
    tags=["scraper_configs"],
    responses={404: {"description": "Not found"}}
)

@router.post("/", response_model=ScraperConfig)
async def create_scraper_config(
    config: ScraperConfigCreate,
    repo: ScraperConfigRepository = Depends(get_scraper_config_repository)
):
    """Create a new scraper configuration"""
    # Check if a config with the same name already exists
    existing = await repo.get_by_name(config.name)
    if existing:
        raise HTTPException(status_code=400, detail="Scraper config with this name already exists")
    
    return await repo.create(config)

@router.get("/", response_model=List[ScraperConfig])
async def get_scraper_configs(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    active_only: bool = False,
    repo: ScraperConfigRepository = Depends(get_scraper_config_repository)
):
    """Get all scraper configurations"""
    return await repo.get_all(skip=skip, limit=limit, active_only=active_only)

@router.get("/{config_id}", response_model=ScraperConfig)
async def get_scraper_config(
    config_id: str,
    repo: ScraperConfigRepository = Depends(get_scraper_config_repository)
):
    """Get a scraper configuration by id"""
    config = await repo.get_by_id(config_id)
    if not config:
        raise HTTPException(status_code=404, detail="Scraper config not found")
    return config

@router.put("/{config_id}", response_model=ScraperConfig)
async def update_scraper_config(
    config_id: str,
    config: ScraperConfigUpdate,
    repo: ScraperConfigRepository = Depends(get_scraper_config_repository)
):
    """Update a scraper configuration"""
    # If name is being updated, check if it already exists
    if config.name:
        existing = await repo.get_by_name(config.name)
        if existing:
            existing_id = existing["id"] if isinstance(existing, dict) else existing.id
            if str(existing_id) != str(config_id):
                raise HTTPException(status_code=400, detail="Scraper config with this name already exists")
    
    updated_config = await repo.update(config_id, config)
    if not updated_config:
        raise HTTPException(status_code=404, detail="Scraper config not found")
    return updated_config

@router.delete("/{config_id}")
async def delete_scraper_config(
    config_id: str,
    repo: ScraperConfigRepository = Depends(get_scraper_config_repository)
):
    """Delete a scraper configuration"""
    deleted = await repo.delete(config_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Scraper config not found")
    return {"message": "Scraper config deleted successfully"}

@router.post("/{config_id}/toggle")
async def toggle_scraper_config(
    config_id: str,
    repo: ScraperConfigRepository = Depends(get_scraper_config_repository)
):
    """Toggle active status of a scraper configuration"""
    config = await repo.get_by_id(config_id)
    if not config:
        raise HTTPException(status_code=404, detail="Scraper config not found")

    # config is a dict from scraper_config_entity
    current_active = config["active"] if isinstance(config, dict) else config.active
    new_active = not current_active
    update = ScraperConfigUpdate(active=new_active)
    updated = await repo.update(config_id, update)
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to toggle scraper config")
    name = updated["name"] if isinstance(updated, dict) else updated.name
    active = updated["active"] if isinstance(updated, dict) else updated.active
    return {"name": name, "active": active}


async def run_scraper(config_id: UUID, scraper_repo, licitacion_repo):
    """Background task to run a scraper"""
    try:
        config = await scraper_repo.get_by_id(config_id)
        if not config:
            logger.error(f"Scraper config {config_id} not found")
            return
        
        scraper = create_scraper(config)
        if not scraper:
            logger.error(f"Could not create scraper for config {config.name}")
            return
        
        logger.info(f"Running scraper {config.name}")
        licitaciones = await scraper.run()
        
        # Save the licitaciones to the database
        for licitacion_data in licitaciones:
            # Check if a licitación with the same source URL already exists
            existing = await licitacion_repo.get_all(
                filters={"source_url": licitacion_data.source_url},
                limit=1
            )
            
            if existing:
                # Update the existing licitación
                await licitacion_repo.update(UUID(existing[0]["id"]), licitacion_data)
            else:
                # Create a new licitación
                await licitacion_repo.create(licitacion_data)
        
        # Update the last run time and runs count
        await scraper_repo.update_last_run(config_id)
        
        logger.info(f"Scraper {config.name} completed, processed {len(licitaciones)} licitaciones")
    
    except Exception as e:
        logger.error(f"Error running scraper {config_id}: {e}")

@router.post("/{config_id}/run")
async def run_scraper_config(
    config_id: UUID,
    background_tasks: BackgroundTasks,
    scraper_repo: ScraperConfigRepository = Depends(get_scraper_config_repository),
    licitacion_repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """Run a scraper configuration"""
    config = await scraper_repo.get_by_id(config_id)
    if not config:
        raise HTTPException(status_code=404, detail="Scraper config not found")
    
    # Run the scraper in the background
    background_tasks.add_task(run_scraper, config_id, scraper_repo, licitacion_repo)
    
    return {"message": f"Scraper {config.name} started"}
