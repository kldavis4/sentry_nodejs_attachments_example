const Sentry = require('@sentry/node')
const FormData = require('form-data')
const axios = require('axios')

Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    environment: process.env.SENTRY_ENVIRONMENT
})

Sentry.configureScope((scope) => {
    scope.setTag('app', 'sentry_attachment_issue')
})

const attachmentUrlFromDsn = (dsn, eventId) => {
    const { host, path, projectId, port, protocol, user } = dsn
    return `${protocol}://${host}${port !== '' ? `:${port}` : ''}${
        path !== '' ? `/${path}` : ''
    }/api/${projectId}/events/${eventId}/attachments/?sentry_key=${user}&sentry_version=7&sentry_client=custom-javascript`
}

const attachAsJson = async (
    attachments,
    event,
    client
) => {
    const dsn = client.getDsn()
    if (!dsn) {
        return
    }
    const endpoint = attachmentUrlFromDsn(dsn, event.event_id)

    const formData = new FormData()
    for (let attachment of attachments) {
        formData.append('json-attachment', JSON.stringify(attachment))
    }

    try {
        const res = await axios.request({
            method: 'POST',
            url: endpoint,
            data: formData,
            headers: {
                'Content-Type': `multipart/form-data; boundary=${formData.getBoundary()}`,
            },
        })
        console.log(res.status, res.statusText)
    } catch (err) {
        console.warn(err)
        throw new Error('Unexpected error sending attachments to sentry')
    }
}

const captureException = async (e, ctx) => {
    const p = new Promise(
        (resolve) => {
            Sentry.withScope(function (scope) {
                // Setup attachments to include with the report
                if (ctx.attachments && ctx.attachments.length) {
                    scope.addEventProcessor(async (event) => {
                        try {
                            await attachAsJson(
                                ctx.attachments,
                                event,
                                Sentry.getCurrentHub().getClient()
                        )
                        } catch (ex) {
                            console.error(ex)
                        }
                        return event
                    })
                }

                Sentry.captureException(e)
                resolve()
            })
        }
    )

    await p
    await Sentry.flush()
}

(async () => {
    try {
        const error = new Error('this is an error ' + Date.now())
        await captureException(error, {
            attachments: [{
                foo: 'bar'
            }]
        })
    } catch (e) {
        console.error(e)
    }
})();