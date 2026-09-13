from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "CanopyLens API"
    cors_origins: str = "http://localhost:5173"
    modal_token: str = ""
    inference_runner: str = "local"
    gemini_api_key: str = ""
    carto_api_key: str = "eyJhbGciOiJIUzI1NiJ9.eyJhIjoiYWNfMm05d2U2N2UiLCJqdGkiOiI0ODQ5N2I4MCJ9.SEMBKiqTW6nNRNOe-Wd5pGxpJUY_BxyJCj4NsnFGlUs"
    carto_api_base_url: str = "https://gcp-us-east1.api.carto.com"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()