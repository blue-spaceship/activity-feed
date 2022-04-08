import { createClient  } from "redis"

export async function Redis(){
    const client = createClient({
        url: process.env.REDIS_URL,
        password: process.env.REDIS_PASSWORD
    })

    await client.connect()
    return client
}

export default Redis