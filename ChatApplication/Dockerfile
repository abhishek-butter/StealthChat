# Build Stage
FROM maven:3.9.6-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
# Compile the application (skipping tests for speed)
RUN mvn clean package -DskipTests

# Production Run Stage
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
# Copy the compiled JAR from the build stage
COPY --from=build /app/target/stealthchat-0.0.1-SNAPSHOT.jar app.jar
EXPOSE 8080
# Run the application
ENTRYPOINT ["java", "-jar", "app.jar"]
