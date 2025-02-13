"""Initial migration

Revision ID: 0085a456d7e5
Revises: 
Create Date: 2025-02-13 21:41:09.758965

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0085a456d7e5'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table('bin',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('lat', sa.Float(), nullable=False),
    sa.Column('lng', sa.Float(), nullable=False),
    sa.Column('note', sa.String(length=255), nullable=True),
    sa.Column('image_filename', sa.String(length=255), nullable=True),
    sa.Column('route', sa.String(length=50), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('user',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('username', sa.String(length=50), nullable=False),
    sa.Column('password_hash', sa.String(length=64), nullable=False),
    sa.Column('is_admin', sa.Boolean(), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('username')
    )
    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_table('user')
    op.drop_table('bin')
    # ### end Alembic commands ###
