import { HttpService } from '@nestjs/axios';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Injectable()
export class WeatherService {
    private readonly apiKey: string;
    private readonly apiUrl: string;
    private readonly cacheTTL: number = 300; // 캐시 TTL 값을 상수로 설정

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
        @Inject(CACHE_MANAGER) private cacheManager: Cache,
    ) {
        this.apiKey = this.configService.get<string>('OPENWEATHER_API_KEY');
        this.apiUrl = 'http://api.openweathermap.org/data/2.5';
    }

    /**
     * Geocoding API를 이용하여 한글 도시명을 위도와 경도로 변환하는 함수
     */
    private async getCoordinatesByCity(city: string) {
        const geocodeUrl = `http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${this.apiKey}`;
        const response = await firstValueFrom(this.httpService.get(geocodeUrl));
        const data = response.data;
        if (data.length === 0) {
            throw new HttpException("도시 정보를 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
        }

        const { lat, lon } = data[0];
        return { lat, lon };
    }

    /**
     * 도시 명을 입력하여 해당 도시의 날씨 데이터를 호출합니다.
     */
    async getWeatherByCity(city: string) {
        const cacheKey = `weather_${city}`;
        const cachedWeather = await this.cacheManager.get(cacheKey);
        if (cachedWeather) {
            return cachedWeather;
        }

        const { lat, lon } = await this.getCoordinatesByCity(city);

        const url = `${this.apiUrl}/weather?lat=${lat}&lon=${lon}&appid=${this.apiKey}&units=metric&lang=kr`;
        try {
            const response = await this.fetchWeatherData(url);
            const weatherData = this.formatWeatherData(response.data);
            await this.cacheManager.set(cacheKey, weatherData, this.cacheTTL);
            return weatherData;
        } catch (error) {
            throw new HttpException("Failed to fetch weather data", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async getFiveDayForecast(city: string) {
        const cacheKey = `forecast_${city}`;
        const cachedForecast = await this.cacheManager.get(cacheKey);
        if (cachedForecast) {
            return cachedForecast;
        }

        const { lat, lon } = await this.getCoordinatesByCity(city);

        const url = `${this.apiUrl}/forecast?lat=${lat}&lon=${lon}&appid=${this.apiKey}&units=metric&lang=kr`;
        try {
            const response = await this.fetchWeatherData(url);
            // 5일 예보 데이터를 날짜 별로 그룹화하여 가공
            const groupedForecast = this.groupForecastByDate(response.data.list);
            await this.cacheManager.set(cacheKey, groupedForecast, this.cacheTTL);
            return groupedForecast;
        } catch (error) {
            throw new HttpException("Failed to fetch forecast data", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * 공통적으로 API 데이터를 가져오는 함수
     */
    private async fetchWeatherData(url: string) {
        return await firstValueFrom(
            this.httpService.get(url).pipe(
                catchError((error) => {
                    console.error(error);
                    throw new HttpException("City not found", HttpStatus.NOT_FOUND);
                })
            )
        );
    }

    /**
     * 날씨 데이터를 포맷하는 함수
     */
    private formatWeatherData(data: any) {
        const { weather, main, wind, rain = {}, snow = {}, sys } = data;
        return {
            weatherStatus: weather[0].main,
            detailWeatherStatus: weather[0].description,
            currentTemp: `${main.temp.toFixed(2)}℃`,
            apparentTemp: `${main.feels_like.toFixed(2)}℃`,
            currentHumi: `${main.humidity}%`,
            minTemp: `${main.temp_min.toFixed(2)}℃`,
            maxTemp: `${main.temp_max.toFixed(2)}℃`,
            windSpeed: `${wind.speed.toFixed(2)}m/s`,
            rainfall: `${rain["1h"] || 0}mm/h`,
            snowfall: `${snow["1h"] || 0}mm/h`,
            sunriseTime: this.formatUnixTime(sys.sunrise),
            sunsetTime: this.formatUnixTime(sys.sunset),
            icon: weather[0].icon
        };
    }

    /**
     * 예보 데이터를 포맷하는 함수
     */
    private formatForecastData(item: any) {
        const { weather, main, wind, rain = {}, snow = {}, dt_txt } = item;
        return {
            forecastTime: new Date(dt_txt).toLocaleString(),
            weatherStatus: weather[0].main,
            detailWeatherStatus: weather[0].description,
            currentTemp: `${main.temp.toFixed(2)}℃`,
            apparentTemp: `${main.feels_like.toFixed(2)}℃`,
            currentHumi: `${main.humidity}%`,
            minTemp: `${main.temp_min.toFixed(2)}℃`,
            maxTemp: `${main.temp_max.toFixed(2)}℃`,
            windSpeed: `${wind.speed.toFixed(2)}m/s`,
            rainfall: `${rain["1h"] || 0}mm/h`,
            snowfall: `${snow["1h"] || 0}mm/h`,
            icon: weather[0].icon
        };
    }

    /**
     * 날짜 별로 예보 데이터를 그룹화하는 함수
     */
    private groupForecastByDate(forecastData: any[]) {
        return forecastData.reduce((acc, curr) => {
            const forecastDate = new Date(curr.dt_txt).toLocaleDateString();
            if (!acc[forecastDate]) {
                acc[forecastDate] = [];
            }
            acc[forecastDate].push(this.formatForecastData(curr));
            return acc;
        }, {});
    }

    /**
     * Unix 타임스탬프를 로컬 시간으로 변환하는 함수
     */
    private formatUnixTime(timestamp: number): string {
        const date: Date = new Date(timestamp * 1000);
        date.setHours(date.getHours() + 9); // UTC to KST
        return date.toLocaleString();
    }
}

/**
 * 참조
 * https://namjackson.tistory.com/27
 * https://openweathermap.org/current
 * https://bulk.openweathermap.org/sample/
 * https://api.openweathermap.org/data/2.5/weather?lat=37.387903&lon=126.938160&APPID=
 */
