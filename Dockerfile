# 베이스 이미지 설정 (Node.js 18버전)
FROM node:18

# 앱 디렉터리 생성
WORKDIR /usr/src/app

# package.json과 package-lock.json 복사
COPY package*.json ./

# 의존성 설치
RUN npm install

# 앱 소스 복사
COPY . .

# 빌드
RUN npm run build

# 앱이 3000번 포트에서 실행되도록 설정
EXPOSE 3000

# 앱 실행
CMD ["npm", "run", "start:prod"]
