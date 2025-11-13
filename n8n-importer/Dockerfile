FROM alpine:latest

RUN apk add --no-cache curl bash

WORKDIR /app

COPY import-workflow.sh /import-workflow.sh
RUN chmod +x /import-workflow.sh

CMD ["/import-workflow.sh"]

