# CI-only, unmodified official MinIO source supplied as the build context.
# The workflow pins its source commit; no application package contains this server.
FROM golang:1.24.8-bookworm AS build
WORKDIR /src
COPY . .
ENV CGO_ENABLED=0 GOMAXPROCS=2
RUN go build -mod=readonly -trimpath -p 2 -o /minio .

FROM debian:bookworm-slim
COPY --from=build /minio /usr/local/bin/minio
RUN mkdir /data && chown 10001:10001 /data
USER 10001:10001
EXPOSE 9000
ENTRYPOINT ["/usr/local/bin/minio"]
