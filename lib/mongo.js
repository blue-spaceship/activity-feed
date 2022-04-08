import mongoose from 'mongoose'

export async function Mongo(){
    const URI = `${ MONGODB_DATABASE }?retryWrites=true&w=majority`

    if(mongoose.connection.readyState === 0){
        await mongoose.connect( URI )
    }

    return {
        disconect: () => mongoose.disconnect()
    }
}

export default Mongo