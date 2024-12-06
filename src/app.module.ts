import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WeatherModule } from './weather/weather.module';
import { ConfigModule } from '@nestjs/config';
import { existsSync } from 'fs';

const ENV_FILE_EXISTS = existsSync('.env') ? '.env' : '../.env';
@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ENV_FILE_EXISTS,
      isGlobal: true
    }),
    WeatherModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }