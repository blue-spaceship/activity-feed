const mongoose = require('mongoose');
const { createClient } = require('redis')
var Schema = mongoose.Schema;

function requiredData(prop){
    console.trace(`${prop} is required`)
    throw new Error(`${ prop } is required`)
}

async function Redis(){
    const client = createClient({
        url: process.env.REDIS_URL,
        password: process.env.REDIS_PASSWORD
    })

    await client.connect()
    return client
}

var activity_schema = new Schema({
    actor: { type: String, required: true },
    actorModel: { type: String, required: true },
    verb: { type: String, required: true },
    timestamp: { type: Date, required: true },
    target: { type: String },
    targetModel: { type: String },
    source: { type: String },
    sourceModel: { type: String },
    extra: { type: Schema.Types.Mixed }
});

var feed_schema = new Schema({
    _id: { type: String, required: true },
    group: { type: String, required: true, ref: 'FeedGroup' },
    baseModel: { type: String, required: true }
}, {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
})

feed_schema.virtual('activities', {
    ref: 'ActivityFeed',
    localField: '_id',
    foreignField: 'feed'
})

feed_schema.virtual('followers', {
    ref: 'Follow',
    localField: '_id',
    foreignField: 'source',
})

var feed_group_schema = new Schema({
    name: { type: String, required: true }
});

var activity_feed_schema = new Schema({
    feed: {
        type: String,
        required: true,
        ref: 'Feed'
    },
    activity: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'Activity'
    },
    source: {
        type: String,
        ref: 'Feed'
    }
});

var follow_schema = new Schema({
    source: { type: String, ref: 'Feed', required: true },
    target: { type: String, ref: 'Feed', required: true }
},{
    timestamps: true
})

follow_schema.index( { source: 1, target: 1 }, { unique: true } )

const ActivityModel = mongoose.models.Activity || mongoose.model('Activity', activity_schema)
const FeedGroupModel = mongoose.models.FeedGroup || mongoose.model('FeedGroup', feed_group_schema)
const FeedModel = mongoose.models.Feed || mongoose.model('Feed', feed_schema)
const ActivityFeedModel = mongoose.models.ActivityFeed || mongoose.model('ActivityFeed', activity_feed_schema)
const FollowModel = mongoose.models.Follow || mongoose.model('Follow', follow_schema)

class Feed extends FeedModel{
    static async createFeed(id = requiredData('feed id'), baseModel = requiredData('base model'), group){
        const bucket = []

        if(!group){
            bucket.push({ insertOne:{ document:{ _id: id, baseModel, group: 'activities' } } })
            bucket.push({ insertOne:{ document:{ _id: id, baseModel, group: 'notifications' } } })
        }else{
            bucket.push({ insertOne:{ document:{ _id: id, baseModel, group } } })
        }

        const feed = await Feed.bulkWrite( bucket ).then( () => true ).catch( err => { throw new Error('Feed creation failed') })

        return feed
    }

    static async getFeed( id = requiredData('feed id'), { activities = false, followers = false, notifications = false } ) {
        const redis = await Redis()

        const profile = await redis.get(`${id}:profile`)
        let feed = { profile : JSON.parse(profile) }
        
        if(activities){
            feed = { ...feed, activities: await redis.xRange(`${id}:activities`, '-', '+') }
        }

        if(followers){
            feed = { ...feed, followers: await redis.sMembers(`${id}:followers`) }
        }

        if(notifications){
            feed = { ...feed, notifications: await redis.xRange(`${id}:notifications`, '-', '+') }
        }

        await redis.disconnect()
        
        return {
            ...feed,
            getObjectFeed: async () => {
                const feed = await Feed.findOne({ _id: id })
                return feed
            }
        }
    }

    static async createGroup(name = requiredData('group name')){
        const group = await FeedGroupModel.create({ name })
        return group
    }

    static async follow(source = requiredData('source'), sourceModel = requiredData('source model'), target = requiredData('target'), targetModel = requiredData('target model')) {
        const followed = await new FollowModel({ source, target }).save().then( () => true ).catch( err => false )
        if( followed ){
            const redis = await Redis()
            await redis.sAdd(`${source}:followers`, target).catch( err => false )
            // Target is who follows, soruce is who is being followed
            const stream = new Activity({ actor: target, actorModel: targetModel, verb: 'follow', target: source, targetModel: sourceModel })
            await stream.post(target, { extra: [ source ] })
            await redis.disconnect()
        }
    }

    static async unfollow(source = requiredData('source'), sourceModel = requiredData('source model'), target = requiredData('target'), targetModel = requiredData('target model')) {
        const unfollowed = await FollowModel.deleteOne({ source, target }).then( () => true ).catch( err => false )
        if(unfollowed){
            const redis = await Redis()
            await redis.sRem(`${source}:followers`, target).catch( err => false )
            // Target is who unfollows, soruce is who is being unfollowed
            const stream = new Activity({ actor: target, actorModel: targetModel, verb: 'unfollow', target: source, targetModel: sourceModel })
            await stream.post(target, { extra: [ source ] })
            await redis.disconnect()
        }
    }
}

class Activity extends ActivityModel{
    constructor({
            actor = requiredData('actor'),
            actorModel = requiredData('actorModel'),
            verb = requiredData('verb'),
            target = null,
            targetModel = null,
            source = null,
            sourceModel = null,
            extra = {},
            timestamp = new Date().getTime()
            }){
        super()

        this.actor = actor
        this.actorModel = actorModel
        this.verb = verb
        this.timestamp = timestamp
        this.target = target
        this.targetModel = targetModel
        this.source = source
        this.sourceModel = sourceModel
        this.extra = extra
    }

    getData(){
        return {
            actor: this.actor,
            actorModel: this.actorModel,
            verb: this.verb,
            target: this.target,
            targetModel: this.targetModel,
            source: this.source,
            sourceModel: this.sourceModel,
            extra: JSON.stringify(this.extra),
            timestamp: this.timestamp
        }
    }

    async notification(target = requiredData('target'), targetModel = requiredData('target model')){
    }

    async post(id = requiredData('feed id'), { replication = true, extra = [] } = {} ) {
        await this.save()

        let idSet = []
        const bucket = []

        bucket.push({ insertOne:{ document:{ feed: id, activity: this._id, source: id } } })

        if(replication){
            const feed = await Feed.getFeed(id, { followers: true })
            idSet.push(...feed.followers)
        }

        if( extra ){
            if(Array.isArray(extra)){
                idSet.push(...extra)
            }else{
                idSet.push(extra)
            }
        }

        const replicationItems = idSet.map( target => { return { insertOne: { document : { feed : target, activity: this._id, source: id } } } } )
        bucket.push(...replicationItems)
        
        await ActivityFeedModel.bulkWrite(bucket)

        idSet.push(id)

        idSet = [...new Set(idSet)]

        const redis = await Redis()
        const promisses = idSet.map( target => redis.xAdd( `${target}:activities`, '*', this.getData() ) )
        await Promise.all( promisses )
    }
}

exports.Feed = Feed
exports.Activity = Activity